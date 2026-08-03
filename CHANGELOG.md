# Cambios de ÁSTOR

Qué entra en cada versión. El número que se ve junto al nombre de usuario en la
aplicación sale de `package.json`, así que esta lista y lo que hay desplegado
dicen lo mismo.

Se sube el segundo número (1.**1**.0) cuando entran funciones nuevas, y el
tercero (1.1.**1**) cuando solo son correcciones.

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
