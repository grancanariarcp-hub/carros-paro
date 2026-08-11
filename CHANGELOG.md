# Cambios de ÁSTOR

Qué entra en cada versión. El número que se ve junto al nombre de usuario en la
aplicación sale de `package.json`, así que esta lista y lo que hay desplegado
dicen lo mismo.

Se sube el segundo número (1.**1**.0) cuando entran funciones nuevas, y el
tercero (1.1.**1**) cuando solo son correcciones.

---

## 1.6.0 — 11 de agosto de 2026

Pulido para crecer sin sobresaltos. Nada de esto se nota hoy; todo se habría
notado dentro de un año.

### Los listados se sirven por tandas

El historial de un carro se traía entero. Un carro pasa un control al mes
durante años: funciona el primer año y deja de funcionar justo cuando la
herramienta lleva tiempo en uso. Ahora llegan de 25 en 25, con el número de lo
que se está viendo — un listado recortado y uno completo se veían igual.

### Dos cosas que ya estaban mal, no solo lentas

- **El informe de auditorías podía salir incompleto sin avisar.** Pedía los 200
  controles más recientes de *cualquier* centro y descartaba después los de los
  demás. Con dos hospitales activos, un informe podía llegar con la mitad de
  sus controles, o con ninguno. Ahora el hospital se filtra en la consulta, y
  si aun así se recorta, el informe lo dice.
- **Se descargaba el historial entero de una persona para contar tres
  números.** Ahora se piden los conteos.

### Índices y estilos

- 44 índices en claves foráneas. Sin ellos, borrar un usuario obligaba a
  recorrer nueve tablas enteras. Se añaden con las tablas pequeñas, porque
  crearlos ahora es instantáneo y sobre una tabla llena bloquea escrituras.
- La consola de superadministración pasa de 120 estilos en línea a 85, y los
  que quedan son ajustes sueltos o dependen del dato. Un estilo en línea no
  admite media queries: era la causa del fallo de móvil que hubo que corregir.

---

## 1.5.1 — 11 de agosto de 2026

### Ninguna escritura vuelve a fallar en silencio

Quedaban 16 sitios donde la aplicación escribía en la base sin comprobar si
había salido bien. Ahora son cero. Las que importaban:

- La **fecha de caducidad** que se corrige a pie de carro. De ella cuelga el
  aviso semanal: si no se guardaba, el lunes se avisaba de una caducidad
  equivocada o no se avisaba de una real.
- El **mantenimiento de un equipo**: quedaba en el historial, pero el aparato
  seguía figurando como vencido.
- La **baja de los avisos push**: la suscripción seguía viva y la persona
  seguía recibiendo avisos que creía haber desactivado.

### Las pantallas de plantillas dejan de estar duplicadas

Tres pantallas existían dos veces, byte a byte: 1.472 líneas repetidas. Cada
cambio había que hacerlo dos veces y acabarían divergiendo sin que nadie lo
notara. Las dos rutas siguen ahí —cada rol entra por un sitio— pero la pantalla
vive en un solo lugar.

---

## 1.5.0 — 11 de agosto de 2026

*Incluye la 1.4.0, publicada el mismo día: el cierre del almacén de evidencias
se desplegó aparte para que las imágenes no dejaran de verse en ningún momento.*

### Los controles ya no se pierden sin cobertura

El trabajo se hace a pie de carro, en pasillos y sótanos donde la wifi falla. Y
desde que el control se guarda en una sola transacción, una caída de red al
firmar no dejaba media inspección: no dejaba ninguna. Quien acababa de revisar
cuarenta ítems los perdía enteros.

Ahora el control se guarda en el propio dispositivo y se envía solo en cuanto
vuelve la red. En la pantalla de inicio aparece cuántos quedan sin enviar, para
que nadie se vaya creyendo que registró algo que sigue en su móvil.

### Aviso semanal de lo que caduca

Cada lunes por la mañana, quien lleva un servicio recibe qué le caduca en los
próximos 30 días y en qué carro está. Lo ya caducado se marca como crítico: un
medicamento vencido dentro de un carro de parada no se descubre en el informe
mensual, se descubre en la parada.

No se repite mientras el aviso anterior siga sin atender, porque una bandeja
con lo mismo cinco veces se deja de mirar.

### Seguridad

- **Las firmas manuscritas ya no se descargan sin sesión.** El almacén de
  evidencias estaba marcado como público, y eso se salta las políticas de
  acceso. Ahora las imágenes se piden con enlace firmado, y cada hospital solo
  ve las suyas.
- **Las fotos de incidencia no se veían nunca.** Se guardan en un almacén
  privado pero se pedían como públicas. Arreglado de paso.
- El catálogo compartido ya solo se lee con la sesión iniciada.

### Correcciones

- **Nadie recibía los avisos.** Las alertas llegan solo a quien las tiene
  activadas, y en producción no las tenía nadie: cero de nueve usuarios. El
  sistema funcionaba entero sin avisar a ninguna persona. Ahora la ficha del
  hospital lo dice cuando pasa.
- El registro de auditoría se poda al pasar cinco años, para que no crezca sin
  fin. Sigue siendo inmutable para todo lo demás.

---

## 1.3.0 — 11 de agosto de 2026

### El centro se elige de una lista

En el formulario de solicitud de acceso, el hospital ya no se escribe a mano:
se elige de un desplegable con los centros que existen. Y una vez elegido,
también el servicio. Primero se crea el hospital, después sus usuarios.

Un nombre tecleado no servía para asignar a nadie a ninguna parte, así que
quien aprobaba tenía que adivinar a qué centro se refería. Ahora la solicitud
llega con el centro y el servicio ya identificados, y aprobar es confirmar.

A un supervisor se le pide el servicio en el propio formulario: sin él no ve
ningún carro, y la solicitud se atascaría después al aprobarla.

### Seguridad

- **La tabla de hospitales era legible sin iniciar sesión.** Cualquiera con la
  clave anónima —que va dentro del JavaScript público de la página— podía leer
  todos los datos de los centros activos, incluidos los correos de sus
  administradores, el plan contratado y los límites. Ahora solo se publica una
  lista de nombres, que es lo único que el desplegable necesita.

### Correcciones

- **Nadie se enteraba de las solicitudes nuevas.** El aviso se intentaba crear
  desde el navegador buscando a los superadministradores, cosa que un visitante
  sin sesión no puede hacer: no se creaba ninguno, nunca. Las solicitudes solo
  se veían entrando a mirar la pestaña. Ahora avisa la base de datos, y también
  al administrador del centro elegido.

---

## 1.2.0 — 11 de agosto de 2026

### Aprobar una solicitud ahora da de alta a la persona

Antes, «Aprobar» solo marcaba la solicitud como aprobada: no creaba la cuenta,
no creaba el perfil y no avisaba a nadie. Como la bandeja solo muestra las
pendientes, la solicitud desaparecía de la vista y quien la había pedido seguía
sin poder entrar, sin que nadie tuviera forma de notarlo.

Al aprobar se elige hospital y rol —el centro que escribe el solicitante es
texto libre y no basta para asignar a nadie—, se crea la cuenta con el correo
ya confirmado y se devuelve un enlace de un solo uso para entregarle.

Si algo falla, la solicitud **sigue pendiente** y se puede reintentar, en lugar
de desaparecer sin que nadie haya sido dado de alta.

### Correcciones

- **Cuentas que no podían entrar.** Los usuarios creados desde la aplicación
  quedaban con el correo sin confirmar, y sin confirmar Supabase no deja
  iniciar sesión: figuraban como usuarios de pleno derecho y no podían pasar de
  la pantalla de acceso. Afectaba a dos personas reales.

---

## 1.1.0 — 3 de agosto de 2026

### Un control se guarda entero o no se guarda

Guardar un control eran seis escrituras sueltas desde el navegador y solo se
comprobaba si fallaba la primera. Las consecuencias no eran teóricas:

- Si fallaban los **ítems**, quedaba una inspección firmada y sin detalle. Y
  como lo firmado es inmutable, ese detalle ya no se podía añadir nunca.
- Si fallaba el **carro**, no se actualizaba la fecha del próximo control y el
  carro se caía del calendario en silencio. Un carro de parada que nadie vuelve
  a revisar porque la aplicación cree que está al día es exactamente el fallo
  que esta herramienta existe para evitar.

Nada de eso avisaba: la pantalla decía «guardado» y llevaba al informe. Ahora
todo va en una transacción y el error llega a quien está delante del carro.

### Catálogos compartidos

- **Servicios.** Un catálogo común del que cada hospital elige los suyos. El
  superadmin y el administrador de centro pueden crear servicios nuevos.
- **Modelos de dispositivo.** Al dar de alta un aparato se parte de un modelo y
  marca, modelo y categoría se rellenan solos. Evita que el mismo desfibrilador
  acabe escrito de seis maneras entre centros.
- **Plantillas de carro.** Listas de comprobación ya preparadas. Al adoptar una,
  el hospital se queda con su copia y puede ajustarla sin tocar la de nadie.

Los tres se gestionan desde la ficha del hospital, en secciones plegables con
casillas, buscador y el recuento de lo que usa cada uno.

### Correcciones

- **Tildes.** Los mensajes de error de la base llegaban con las tildes rotas
  («Tu cuenta no est� activa»). El texto estaba dañado dentro del código de
  ocho funciones, por cómo se habían aplicado.
- **Auditoría por hospital.** Los asientos de las tablas que no llevan hospital
  propio —entre ellas las inspecciones— se guardaban sin él, así que no salían
  al filtrar el registro por centro. Justo los que más importan.
- **Servicios duplicados.** Nada impedía dos «Urgencias» en el mismo hospital;
  los informes agrupados por servicio se habrían partido en dos trozos que no
  suman.
- **Aislamiento entre centros.** Un aparato podía quedar apuntando a la
  plantilla privada de otro hospital.
- **`search_path`.** Tres funciones con privilegios elevados no lo fijaban.

---

## 1.0.0

Primera versión en uso en el H.U. Gran Canaria Doctor Negrín.
