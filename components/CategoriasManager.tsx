'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import toast from 'react-hot-toast'

// =====================================================================
// Tipos
// =====================================================================

export interface CategoriaEquipo {
  id: string
  nombre: string
  hospital_id: string | null
  es_global: boolean
  activo: boolean
  visible: boolean
  favorita: boolean
  orden_grupo: number
}

interface Props {
  hospitalId: string | null   // null = modo superadmin (gestiona globales)
  rol: 'superadmin' | 'administrador'
  titulo?: string
}

// =====================================================================
// Componente
// =====================================================================

export default function CategoriasManager({ hospitalId, rol, titulo }: Props) {
  const [categorias, setCategorias] = useState<CategoriaEquipo[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevaNombre, setNuevaNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const supabase = createClient()

  useEffect(() => { cargar() }, [hospitalId])

  async function cargar() {
    setLoading(true)
    if (rol === 'superadmin') {
      // Superadmin: ve todas las globales (hospital_id IS NULL)
      const { data } = await supabase
        .from('categorias_equipo')
        .select('*')
        .is('hospital_id', null)
        .order('nombre')
      setCategorias((data || []).map(c => ({
        ...c, visible: true, favorita: false, orden_grupo: 0
      })))
    } else if (hospitalId) {
      // Admin: ve globales + propias, con preferencias
      const { data } = await supabase
        .from('v_categorias_por_hospital')
        .select('*')
        .or(`hospital_id.is.null,hospital_id.eq.${hospitalId}`)
        .eq('visible', true)
        .order('orden_grupo')
        .order('nombre')
      setCategorias(data || [])
    }
    setLoading(false)
  }

  async function crear() {
    const nombre = nuevaNombre.trim()
    if (!nombre) return
    if (categorias.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) {
      toast.error('Ya existe una categoría con ese nombre')
      return
    }
    setCreando(true)
    const { error } = await supabase.from('categorias_equipo').insert({
      nombre,
      hospital_id: rol === 'superadmin' ? null : hospitalId,
      es_global: rol === 'superadmin',
      activo: true,
    })
    if (error) {
      toast.error('Error al crear categoría')
    } else {
      toast.success(`Categoría "${nombre}" creada`)
      setNuevaNombre('')
      await cargar()
    }
    setCreando(false)
  }

  async function guardarEdicion(id: string) {
    const nombre = editNombre.trim()
    if (!nombre) return
    if (categorias.some(c => c.nombre.toLowerCase() === nombre.toLowerCase() && c.id !== id)) {
      toast.error('Ya existe una categoría con ese nombre')
      return
    }
    const { error } = await supabase
      .from('categorias_equipo')
      .update({ nombre })
      .eq('id', id)
    if (error) {
      toast.error('Error al renombrar')
    } else {
      toast.success('Categoría renombrada')
      setEditando(null)
      await cargar()
    }
  }

  async function toggleActivo(cat: CategoriaEquipo) {
    // Si es global y el admin la quiere ocultar, usa la tabla puente
    if (cat.es_global && rol === 'administrador' && hospitalId) {
      const { error } = await supabase
        .from('categorias_equipo_hospital')
        .upsert({
          hospital_id: hospitalId,
          categoria_id: cat.id,
          visible: false,
          favorita: cat.favorita,
        }, { onConflict: 'hospital_id,categoria_id' })
      if (error) { toast.error('Error'); return }
      toast.success(`"${cat.nombre}" ocultada para este hospital`)
      await cargar()
      return
    }
    // Si es propia, desactiva directamente
    const { error } = await supabase
      .from('categorias_equipo')
      .update({ activo: !cat.activo })
      .eq('id', cat.id)
    if (error) { toast.error('Error'); return }
    toast.success(cat.activo ? 'Categoría desactivada' : 'Categoría activada')
    await cargar()
  }

  async function toggleFavorita(cat: CategoriaEquipo) {
    if (!hospitalId) return
    const { error } = await supabase
      .from('categorias_equipo_hospital')
      .upsert({
        hospital_id: hospitalId,
        categoria_id: cat.id,
        visible: cat.visible,
        favorita: !cat.favorita,
      }, { onConflict: 'hospital_id,categoria_id' })
    if (error) { toast.error('Error'); return }
    toast.success(!cat.favorita ? `"${cat.nombre}" marcada como favorita` : 'Favorita eliminada')
    await cargar()
  }

  async function restaurarOcultas() {
    if (!hospitalId) return
    const { error } = await supabase
      .from('categorias_equipo_hospital')
      .update({ visible: true })
      .eq('hospital_id', hospitalId)
    if (error) { toast.error('Error'); return }
    toast.success('Categorías globales restauradas')
    await cargar()
  }

  const propias = categorias.filter(c => c.hospital_id !== null)
  const globales = categorias.filter(c => c.hospital_id === null)
  const favoritas = categorias.filter(c => c.favorita)

  if (loading) return <div className="text-xs text-gray-400 py-4 text-center">Cargando categorías...</div>

  return (
    <div className="space-y-4">
      {titulo && <div className="section-title">{titulo}</div>}

      {/* Crear nueva */}
      <div className="card">
        <div className="text-xs font-semibold text-gray-700 mb-2">
          {rol === 'superadmin' ? 'Nueva categoría global' : 'Nueva categoría del hospital'}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            className="input flex-1 text-sm"
            placeholder="Nombre de la categoría"
            value={nuevaNombre}
            onChange={e => setNuevaNombre(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && crear()}
            autoComplete="off"
          />
          <button
            onClick={crear}
            disabled={!nuevaNombre.trim() || creando}
            className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold disabled:opacity-40"
          >
            {creando ? '…' : '+ Crear'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {rol === 'superadmin'
            ? 'Visible en todos los hospitales. Los admins pueden ocultarla o marcarla como favorita.'
            : 'Solo visible en tu hospital. Las categorías globales aparecen automáticamente.'}
        </p>
      </div>

      {/* Favoritas (solo admin) */}
      {rol === 'administrador' && favoritas.length > 0 && (
        <div className="card">
          <div className="text-xs font-semibold text-gray-700 mb-2">⭐ Favoritas</div>
          {favoritas.map(cat => (
            <FilaCategoria key={cat.id}
              cat={cat} rol={rol}
              editando={editando} editNombre={editNombre}
              onEditar={() => { setEditando(cat.id); setEditNombre(cat.nombre) }}
              onGuardar={() => guardarEdicion(cat.id)}
              onCancelar={() => setEditando(null)}
              onEditNombre={setEditNombre}
              onToggleActivo={() => toggleActivo(cat)}
              onToggleFavorita={() => toggleFavorita(cat)}
            />
          ))}
        </div>
      )}

      {/* Propias del hospital */}
      {rol === 'administrador' && propias.length > 0 && (
        <div className="card">
          <div className="text-xs font-semibold text-gray-700 mb-2">
            🏥 Categorías de este hospital ({propias.length})
          </div>
          {propias.map(cat => (
            <FilaCategoria key={cat.id}
              cat={cat} rol={rol}
              editando={editando} editNombre={editNombre}
              onEditar={() => { setEditando(cat.id); setEditNombre(cat.nombre) }}
              onGuardar={() => guardarEdicion(cat.id)}
              onCancelar={() => setEditando(null)}
              onEditNombre={setEditNombre}
              onToggleActivo={() => toggleActivo(cat)}
              onToggleFavorita={() => toggleFavorita(cat)}
            />
          ))}
        </div>
      )}

      {/* Globales del sistema */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-gray-700">
            🌐 Categorías globales del sistema ({globales.length})
          </div>
          {rol === 'administrador' && (
            <button onClick={restaurarOcultas}
              className="text-xs text-blue-600 font-semibold">
              Restaurar ocultas
            </button>
          )}
        </div>
        {globales.length === 0 && (
          <div className="text-xs text-gray-400 py-2">No hay categorías globales activas</div>
        )}
        {globales.map(cat => (
          <FilaCategoria key={cat.id}
            cat={cat} rol={rol}
            editando={editando} editNombre={editNombre}
            onEditar={() => { setEditando(cat.id); setEditNombre(cat.nombre) }}
            onGuardar={() => guardarEdicion(cat.id)}
            onCancelar={() => setEditando(null)}
            onEditNombre={setEditNombre}
            onToggleActivo={() => toggleActivo(cat)}
            onToggleFavorita={() => toggleFavorita(cat)}
          />
        ))}
      </div>
    </div>
  )
}

// =====================================================================
// Fila de categoría
// =====================================================================

function FilaCategoria({
  cat, rol,
  editando, editNombre,
  onEditar, onGuardar, onCancelar, onEditNombre,
  onToggleActivo, onToggleFavorita,
}: {
  cat: CategoriaEquipo
  rol: 'superadmin' | 'administrador'
  editando: string | null
  editNombre: string
  onEditar: () => void
  onGuardar: () => void
  onCancelar: () => void
  onEditNombre: (v: string) => void
  onToggleActivo: () => void
  onToggleFavorita: () => void
}) {
  const esPropia = cat.hospital_id !== null
  const puedeEditar = rol === 'superadmin' || esPropia

  if (editando === cat.id) {
    return (
      <div className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
        <input
          type="text"
          className="input flex-1 text-xs py-1"
          value={editNombre}
          onChange={e => onEditNombre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onGuardar(); if (e.key === 'Escape') onCancelar() }}
          autoFocus
        />
        <button onClick={onGuardar}
          className="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg font-semibold">
          ✓
        </button>
        <button onClick={onCancelar}
          className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-500">
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 py-2 border-b border-gray-50 last:border-0 ${!cat.activo ? 'opacity-40' : ''}`}>
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        {cat.favorita && <span className="text-amber-400 text-xs">⭐</span>}
        {cat.es_global && !cat.favorita && <span className="text-xs text-gray-300">🌐</span>}
        <span className="text-xs font-medium text-gray-800 truncate">{cat.nombre}</span>
        {esPropia && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold">
            propia
          </span>
        )}
      </div>

      {/* Favorita — solo admin, solo globales */}
      {rol === 'administrador' && !esPropia && (
        <button onClick={onToggleFavorita}
          className={`text-xs px-2 py-1 rounded-lg border font-semibold transition-colors ${
            cat.favorita
              ? 'border-amber-300 text-amber-600 bg-amber-50'
              : 'border-gray-200 text-gray-400 bg-gray-50'
          }`}
          title={cat.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
        >
          ⭐
        </button>
      )}

      {/* Editar nombre — superadmin o categoría propia */}
      {puedeEditar && (
        <button onClick={onEditar}
          className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 bg-gray-50">
          ✏️
        </button>
      )}

      {/* Ocultar/desactivar */}
      <button onClick={onToggleActivo}
        className={`text-xs px-2 py-1 rounded-lg border font-semibold ${
          cat.activo
            ? 'border-amber-200 text-amber-600 bg-amber-50'
            : 'border-green-200 text-green-600 bg-green-50'
        }`}
        title={
          cat.es_global && rol === 'administrador'
            ? 'Ocultar esta categoría global en tu hospital'
            : cat.activo ? 'Desactivar' : 'Activar'
        }
      >
        {cat.activo
          ? (cat.es_global && rol === 'administrador' ? 'Ocultar' : 'Desactivar')
          : 'Activar'}
      </button>
    </div>
  )
}
