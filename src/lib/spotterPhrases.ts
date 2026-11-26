export type EngineerPersonality = "wec_pro" | "motivator" | "strategist" | "streamer_hype" | string;

export interface SpotterEventContext {
  place?: number;
  classPlace?: number;
  sector?: number;
  driver?: string;
  gap?: string;
  temp?: number;
  wear?: number;
  wheel?: string;
  mins?: number;
  laps?: string;
  advice?: string;
  gained?: number;
  lost?: number;
  delta?: string;
}

export const EDITABLE_SPOTTER_EVENTS: { key: string; label: string; hint?: string }[] = [
  { key: "Salida a Pista", label: "Salida a Pista (Motivación inicial)" },
  { key: "Salida Carrera", label: "Salida de Carrera (Semáforo verde)" },
  { key: "Coche Izquierda", label: "Coche a la Izquierda" },
  { key: "Coche Derecha", label: "Coche a la Derecha" },
  { key: "Tres en Paralelo", label: "Tres en Paralelo" },
  { key: "Libre", label: "Libre (Costados despejados)" },
  { key: "Bandera Amarilla", label: "Bandera Amarilla" },
  { key: "Full Course Yellow", label: "Full Course Yellow (FCY)" },
  { key: "Bandera Azul", label: "Bandera Azul" },
  { key: "Bandera Verde", label: "Bandera Verde" },
  { key: "Entrada Boxes", label: "Entrada a Boxes" },
  { key: "Salida Boxes", label: "Salida de Boxes" },
  { key: "Salida Pit Lane", label: "Fin de Pit Lane" },
  { key: "Parada Exitosa", label: "Parada Exitosa" },
  { key: "Box Esta Vuelta", label: "Box en Esta Vuelta" },
  { key: "Gomas en Ventana", label: "Gomas en Ventana (Grip óptimo)" },
  { key: "Caza Rival", label: "Predicción de Caza (Recortando al de delante)", hint: "Variables: {driver}, {delta}, {laps}" },
  { key: "Defensa Rival", label: "Predicción de Defensa (Rival acercándose)", hint: "Variables: {driver}, {delta}, {laps}" },
  { key: "Sector Verde", label: "Sector Verde", hint: "Variables: {sector}" },
  { key: "Sector Purpura", label: "Sector Púrpura", hint: "Variables: {sector}" },
  { key: "Posicion Ganada", label: "Posición Ganada", hint: "Variables: {place}" },
  { key: "Posicion Perdida", label: "Posición Perdida", hint: "Variables: {place}" },
  { key: "Victoria", label: "Final: Victoria (P1)" },
  { key: "Podio", label: "Final: Podio (P2 / P3)", hint: "Variables: {place}" },
  { key: "Final Remontada", label: "Final: Enhorabuena / Remontada", hint: "Variables: {place}, {gained}" },
  { key: "Final Pesimista", label: "Final: Pesimista (Posiciones perdidas)", hint: "Variables: {place}, {lost}" },
  { key: "Animo Metronomo", label: "Ánimo: Racha de metrónomo (consistencia)", hint: "Variables: {laps}" },
  { key: "Animo Tras Error", label: "Ánimo: Recuperación tras error o salida" },
  { key: "Animo Defensa Exitosa", label: "Ánimo: Defensa aguantada con éxito", hint: "Variables: {driver}" },
  { key: "Animo Remontada", label: "Ánimo: Remontada en marcha", hint: "Variables: {gained}, {place}" },
  { key: "Animo Tramo Final", label: "Ánimo: Empujón en tramo final de carrera" },
  { key: "Animo Stint Limpio", label: "Ánimo: Stint largo limpio sin errores", hint: "Variables: {laps}" },
];

type PhraseBank = Partial<Record<string, string[]>>;

const PHRASES: Record<string, PhraseBank> = {
  wec_pro: {
    "Coche Izquierda": [
      "Coche a la izquierda.",
      "Tienes coche por la izquierda, mantén tu línea.",
      "Izquierda ocupada, aguanta por fuera.",
    ],
    "Coche Derecha": [
      "Coche a la derecha.",
      "Tienes coche por la derecha, deja espacio.",
      "Derecha ocupada, mantén la trazada.",
    ],
    "Tres en Paralelo": [
      "Cuidado, tres en paralelo.",
      "Tres coches en paralelo, máxima precaución.",
    ],
    "Libre": [
      "Libre.",
      "Despejado por ambos lados.",
      "Pista libre, puedes cerrar.",
    ],
    "Salida a Pista": [
      "Radio check, te recibo alto y claro. Calienta gomas y frenos con progresividad.",
      "En pista. Todo verificado en telemetría, construye el ritmo paso a paso.",
      "Radio activa. Temperatura en ascenso, primeras vueltas limpias para meter gomas en ventana.",
    ],
    "Salida Carrera": [
      "Luces fuera, estamos en carrera. Cabeza fría en la primera curva.",
      "Arrancamos. Protege el interior y evita incidentes en la primera vuelta.",
    ],
    "Bandera Amarilla": [
      "Atención, bandera amarilla delante. Levanta ligeramente y vigila coches detenidos.",
      "Bandera amarilla en pista, precaución, prohibido adelantar.",
      "Precaución, incidente por delante con bandera amarilla.",
    ],
    "Full Course Yellow": [
      "Full Course Yellow activo. Reduce a ochenta kilómetros por hora y activa el limitador.",
      "Atención, procedimiento de Full Course Yellow. Controla la velocidad de inmediato.",
    ],
    "Bandera Azul": [
      "Bandera azul, coche más rápido aproximándose por detrás.",
      "Tráfico rápido detrás con bandera azul, mantén línea predecible.",
      "Bandera azul, facilita el paso en la próxima recta sin perder ritmo.",
    ],
    "Bandera Verde": [
      "Bandera verde, pista libre.",
      "Pista despejada, bandera verde, vuelve a ritmo de carrera.",
      "Verde en pista, gas a fondo.",
    ],
    "Bandera Negra": [
      "Atención, dirección de carrera nos ha impuesto una penalización.",
      "Tenemos sanción pendiente, revisaremos cuándo cumplirla.",
    ],
    "Vuelta Cancelada": [
      "Vuelta anulada por límites de pista. Enfría gomas y prepara la siguiente.",
      "Tiempo borrado por exceder límites de pista, céntrate en la próxima vuelta.",
    ],
    "Entrada Boxes": [
      "Entrando a calle de boxes, vigila la línea y activa el limitador.",
      "En pit lane, controla la velocidad hasta tu box.",
    ],
    "Salida Boxes": [
      "Saliendo de boxes, atención a la línea blanca y al tráfico en recta.",
      "De vuelta a pista, respeta la salida del pit lane.",
    ],
    "Salida Pit Lane": [
      "Fin de pit lane, quita el limitador. Gas a fondo.",
      "Línea de boxes superada, limitador fuera, empuja.",
    ],
    "Parada Exitosa": [
      "Buena parada de boxes. Coche listo, a marcar ritmo.",
      "Servicio completado limpio. Calienta gomas en esta vuelta de salida.",
    ],
    "Limitador Pit": [
      "Limitador activado.",
      "Velocidad de pit lane bloqueada.",
    ],
    "Box Esta Vuelta": [
      "Box en esta vuelta, combustible en reserva crítica.",
      "Entra a boxes al final de esta vuelta, vamos justos de combustible.",
    ],
    "Combustible Bajo": [
      "Quedan dos vueltas de combustible, prepara ventana de parada.",
      "Nivel de combustible bajo, dos vueltas de margen.",
    ],
    "Sector Verde": [
      "Sector {sector} en verde, mejora personal.",
      "Buen sector {sector}, estás bajando tu tiempo.",
    ],
    "Sector Purpura": [
      "Sector {sector} en púrpura, récord de sesión.",
      "Récord absoluto en el sector {sector}, excelente ritmo.",
    ],
    "Mejor Vuelta": [
      "Mejor vuelta personal, sigue constante.",
      "Gran vuelta, nuevo mejor tiempo personal.",
    ],
    "Posicion Ganada": [
      "Posición ganada, estás en P{place}. Consolida el hueco.",
      "Buen adelantamiento, ya eres P{place}.",
    ],
    "Posicion Perdida": [
      "Posición perdida, bajas a P{place}. Mantén la calma y recupera ritmo.",
      "Estás P{place}, no te precipites, vuelve a presionar.",
    ],
    "Daños Coche": [
      "Atención, detectamos daños en el coche. Evalúa el equilibrio en la siguiente curva.",
      "Hemos sufrido un toque, revisa sensaciones de dirección y aerodinámica.",
    ],
    "Lluvia Inminente": [
      "Empiezan a caer gotas en pista, extrema la precaución en frenada.",
      "Lluvia detectada en el circuito, vigila el agarre en los pianos.",
    ],
    "Frenos Calientes": [
      "Atención, discos de freno a {temp} grados. Mueve el reparto o refrigera en recta.",
      "Temperatura de frenos alta, {temp} grados, cuida las frenadas fuertes.",
    ],
    "Desgaste Neumaticos": [
      "Aviso de desgaste: la {wheel} baja al {wear} por ciento, gestiona el apoyo.",
      "Goma {wheel} al {wear} por ciento, evita deslizar en curva lenta.",
    ],
    "Aviso Limites Pista": [
      "Cuidado con los límites de pista, un aviso más y nos cae penalización.",
      "Estás al límite de track limits, mete el coche por lo negro para evitar sanción.",
    ],
    "Energia Virtual Baja": [
      "Energía virtual baja, quedan {laps} vueltas de margen. Prepara entrada a boxes.",
      "Atención a la energía virtual, {laps} vueltas restantes antes de parar.",
    ],
    "Rival Boxes": [
      "{driver} acaba de entrar a boxes. Tienes pista limpia, empuja para el overcut.",
      "El coche de delante, {driver}, entra a pit lane. Sube el ritmo en esta vuelta.",
    ],
    "Tiempo Restante": [
      "Quedan {mins} minutos de carrera, mantén el ritmo.",
      "Entramos en los últimos {mins} minutos de sesión, máxima concentración.",
    ],
    "Motor Caliente": [
      "Temperatura de motor elevada, sal del rebufo en recta para refrigerar.",
      "Atención, motor sobrecalentado, busca aire limpio.",
    ],
    "Coche Delante Cerca": [
      "Tienes a {driver} a {gap} segundos, a tiro de rebufo.",
      "{driver} delante a {gap} segundos, prepárale el adelantamiento.",
    ],
    "Presion Detras": [
      "{driver} viene pegado detrás a {gap} segundos, cubre el interior.",
      "Atención detrás, {driver} a {gap} segundos, defiende tu posición.",
    ],
    "Resumen Vuelta": [
      "Buen ritmo. Vas P{place}, {driver} delante a {gap} segundos.",
      "Ritmo constante en P{place}, diferencia de {gap} segundos con {driver}.",
    ],
    "Bloqueo Repetido": [
      "Segundo bloqueo seguido. {advice} para estabilizar la frenada.",
      "Estás bloqueando en frenada, {advice}.",
    ],
    "Lift And Coast": [
      "Haz lift and coast en las rectas largas, ahorrando {laps} vueltas evitas una parada extra.",
      "Ahorro de energía: levanta antes de frenar, con {laps} vueltas de ahorro llegamos sin parar.",
    ],
    "Victoria": [
      "Bandera a cuadros, victoria, P1. Carrera impecable de principio a fin, enhorabuena de todo el equipo.",
    ],
    "Podio": [
      "Bandera a cuadros, podio en P{place}. Excelente resultado y puntos muy valiosos para el equipo.",
    ],
    "Final Remontada": [
      "Enhorabuena, gran remontada de {gained} posiciones hasta P{place}. Muy buen trabajo en pista.",
      "Bandera a cuadros en P{place}, {gained} puestos ganados desde salida. Carrera muy sólida.",
    ],
    "Final Pesimista": [
      "Bandera a cuadros en P{place}. Hemos perdido {lost} posiciones hoy, día complicado para olvidar. Trae el coche a boxes.",
      "Terminamos P{place}, {lost} puestos abajo respecto a salida. Toca analizar qué ha fallado hoy.",
    ],
    "Gomas en Ventana": [
      "Gomas en ventana óptima, ya tienes grip para empujar.",
      "Temperatura de neumáticos perfecta, pista tuya, ya puedes apretar.",
    ],
    "Caza Rival": [
      "Le estás recortando {delta} por vuelta a {driver}. A este ritmo en {laps} lo tienes encima.",
      "Ritmo muy superior al de {driver}, recortas {delta} por vuelta. En {laps} estás en zona de ataque.",
    ],
    "Defensa Rival": [
      "Atención, {driver} viene {delta} más rápido por vuelta. En {laps} estará encima, prepara defensa.",
      "{driver} te recorta {delta} por vuelta por detrás. Mantén la calma y prepara la defensa en {laps}.",
    ],
    "Animo Metronomo": [
      "Ritmo de metrónomo, {laps} vueltas seguidas clavadas al mismo tiempo. Gran trabajo.",
      "Consistencia impecable, {laps} vueltas en el mismo margen. Sigue exactamente así.",
    ],
    "Animo Tras Error": [
      "Cabeza fría, eso ya pasó. Queda mucha carrera, resetea y vuelve a tu ritmo.",
      "Sin dramas, céntrate en la siguiente curva y reconstruye tu ritmo paso a paso.",
    ],
    "Animo Defensa Exitosa": [
      "Gran defensa frente a {driver}, ya has abierto hueco. Respira y marca tu ritmo.",
      "Impecable aguantando a {driver}, lo has descolgado. Ahora gestiona con calma.",
    ],
    "Animo Remontada": [
      "Ya llevas {gained} posiciones ganadas hasta P{place}. Gran remontada, sigue empujando.",
      "Muy buena progresión, {gained} puestos arriba y ya en P{place}. Mantén esta línea.",
    ],
    "Animo Tramo Final": [
      "Recta final de carrera, máxima concentración ahora. Tienes ritmo de sobra, dalo todo.",
      "Últimos minutos de carrera y estás en la pelea. Cabeza fría y ejecución perfecta.",
    ],
    "Animo Stint Limpio": [
      "{laps} vueltas seguidas sin un solo fallo. Stint de libro, mantén el foco.",
      "Conducción muy madura, {laps} vueltas limpias consecutivas. Excelente trabajo en pista.",
    ],
  },

  motivator: {
    "Coche Izquierda": [
      "Coche a la izquierda, aguanta firme ahí.",
      "Lo tienes a tu izquierda, mantén tu sitio.",
    ],
    "Coche Derecha": [
      "Coche a la derecha, defiende tu línea.",
      "Por la derecha, aguanta limpio ahí.",
    ],
    "Tres en Paralelo": [
      "Cuidado, tres en paralelo, templanza y cabeza fría.",
      "Tres coches a la vez, respira y sal vivo de esta.",
    ],
    "Libre": [
      "Libre, dale gas.",
      "Despejado, a empujar.",
    ],
    "Salida a Pista": [
      "Vamos allá campeón, radio perfecta. Calienta bien esas gomas y a disfrutar en pista.",
      "Sales a pista, confía en tu ritmo. Haz dos vueltas limpias y luego a volar.",
      "Todo listo en el coche, hoy es tu día. Concentración máxima y a por todas.",
    ],
    "Salida Carrera": [
      "Luces fuera, vamos con todo. Primera curva limpia y a ganar posiciones.",
      "Arrancamos, corazón caliente y cabeza fría. A por ellos.",
    ],
    "Bandera Amarilla": [
      "Ojo, bandera amarilla delante, no arriesgues aquí.",
      "Amarilla en pista, levanta un punto y pasa seguro.",
      "Precaución delante con bandera amarilla, salva el coche.",
    ],
    "Full Course Yellow": [
      "Full Course Yellow en pista, baja a ochenta y aprovecha para respirar.",
      "Atención, Full Course Yellow, limitador puesto y concentración.",
    ],
    "Bandera Azul": [
      "Bandera azul, viene coche rápido detrás, déjalo pasar limpio sin perder tiempo.",
      "Tráfico rápido detrás con bandera azul, facilita el paso y sigue a lo tuyo.",
    ],
    "Bandera Verde": [
      "Bandera verde, pista libre, gas a fondo.",
      "Verde en pista, vuelve a atacar ahora.",
    ],
    "Entrada Boxes": [
      "Entrando a boxes, clava esa frenada y pon el limitador.",
      "En pit lane, tranquilo y preciso hasta la marca.",
    ],
    "Salida Boxes": [
      "Saliendo de boxes, cuidado con la línea blanca y a remontar.",
      "De vuelta a la batalla, ojo al tráfico al incorporarte.",
    ],
    "Salida Pit Lane": [
      "Fin de pit lane, quita el limitador y gas a fondo, vamos.",
      "Pista abierta, limitador fuera, enséñales tu ritmo.",
    ],
    "Parada Exitosa": [
      "Paradón del equipo, coche listo y gomas frescas. A comerse la pista.",
      "Parada limpia y rapidísima, ahora a volar.",
    ],
    "Sector Verde": [
      "Sector {sector} en verde, así se hace, sigue empujando.",
      "Muy bien ese sector {sector}, estás volando.",
    ],
    "Sector Purpura": [
      "Sector {sector} en púrpura, qué barbaridad de ritmo llevas.",
      "Récord en el sector {sector}, nadie te sigue hoy.",
    ],
    "Mejor Vuelta": [
      "Vueltón, mejor tiempo personal, sigue así.",
      "Brutal esa vuelta, nuevo récord personal.",
    ],
    "Posicion Ganada": [
      "Qué adelantamiento, ya estás en P{place}. Ahora a abrir hueco.",
      "Toma ya, P{place}. Sigue apretando que tienes ritmo de sobra.",
    ],
    "Posicion Perdida": [
      "No pasa nada, estás P{place}. Cabeza fría que se la devuelves en dos vueltas.",
      "Has cedido a P{place}, respira y vuelve a pegarte a su alerón.",
    ],
    "Frenos Calientes": [
      "Ojo con los frenos, están a {temp} grados. Suaviza un punto la frenada.",
    ],
    "Desgaste Neumaticos": [
      "La goma {wheel} está al {wear} por ciento, cuídala en las curvas rápidas.",
    ],
    "Aviso Limites Pista": [
      "Ojo con los límites de pista campeón, un aviso más y nos sancionan.",
    ],
    "Energia Virtual Baja": [
      "Quedan {laps} vueltas de energía virtual, prepara la parada.",
    ],
    "Rival Boxes": [
      "{driver} entra a boxes. Pista libre delante, dale gas y a volar.",
    ],
    "Tiempo Restante": [
      "Últimos {mins} minutos, dale con todo hasta bandera a cuadros.",
    ],
    "Motor Caliente": [
      "Motor caliente, sal del rebufo un segundo para darle aire fresco.",
    ],
    "Coche Delante Cerca": [
      "Lo tienes ahí, {driver} a {gap} segundos. Presiónale que va a ceder.",
    ],
    "Presion Detras": [
      "{driver} te presiona a {gap} segundos detrás, aguanta firme el interior.",
    ],
    "Resumen Vuelta": [
      "Muy bien, P{place} y {driver} a {gap} segundos delante. Sigue así.",
    ],
    "Bloqueo Repetido": [
      "Ojo con esos bloqueos campeón, {advice} y entrarás mucho más limpio.",
    ],
    "Lift And Coast": [
      "Un poco de lift and coast en recta, si ahorramos {laps} vueltas nos ahorramos una parada entera.",
    ],
    "Victoria": [
      "Sí, victoria, eres el número uno. Qué carrerón te has marcado, enhorabuena campeón.",
    ],
    "Podio": [
      "Podio en P{place}, toma ya. Qué exhibición has dado hoy, enhorabuena.",
    ],
    "Final Remontada": [
      "Brutal remontada, has ganado {gained} posiciones hasta P{place}. Qué carácter en pista, enhorabuena.",
    ],
    "Final Pesimista": [
      "Qué pena, terminamos P{place} perdiendo {lost} posiciones. Hoy no ha salido nada, pero volveremos más fuertes.",
    ],
    "Gomas en Ventana": [
      "Gomas listas y en ventana, ahora tienes todo el grip, dale fuerte.",
      "Neumáticos en su punto perfecto, momento de atacar campeón.",
    ],
    "Caza Rival": [
      "Le estás comiendo {delta} por vuelta a {driver}. Sigue así que en {laps} lo pasas seguro.",
      "Vuelas sobre {driver}, {delta} más rápido por vuelta. En {laps} estás encima, a por él.",
    ],
    "Defensa Rival": [
      "Ojo que {driver} viene {delta} más rápido por vuelta, en {laps} llega. Tú aguanta firme que tienes ritmo.",
    ],
    "Animo Metronomo": [
      "Qué metrónomo, {laps} vueltas seguidas calcadas. Estás pilotando a un nivel espectacular.",
      "Brutal consistencia, {laps} vueltas seguidas al mismo ritmo. Sigue volando campeón.",
    ],
    "Animo Tras Error": [
      "Arriba ese ánimo campeón, un fallo lo tiene cualquiera. Resetea y a por todas que queda carrera.",
      "Olvídalo ya, cabeza fría y gas. Tienes ritmo para recuperar eso y mucho más.",
    ],
    "Animo Defensa Exitosa": [
      "Qué clase defendiendo frente a {driver}. Lo has dejado atrás, ahora a volar.",
      "Defensa de campeón contra {driver}, ya tienes aire limpio. Enorme trabajo.",
    ],
    "Animo Remontada": [
      "Menuda remontada llevas, {gained} puestos ganados hasta P{place}. Nadie te para hoy.",
    ],
    "Animo Tramo Final": [
      "Últimos minutos y lo tienes ahí. Cree en tu ritmo, tú puedes con esto campeón.",
    ],
    "Animo Stint Limpio": [
      "{laps} vueltas seguidas sin un error, qué barbaridad de stint. Sigue así campeón.",
    ],
  },

  strategist: {
    "Salida a Pista": [
      "Telemetría en línea. Prioriza gestión térmica en las dos primeras vueltas para maximizar vida de goma.",
      "En pista. Monitorizamos consumo y energía virtual desde la primera vuelta, mantén ritmo constante.",
    ],
    "Bandera Amarilla": [
      "Bandera amarilla delante. Aprovecha para levantar y ahorrar combustible sin perder posición.",
      "Incidente con bandera amarilla, gestiona la velocidad y cuida los frenos.",
    ],
    "Full Course Yellow": [
      "Full Course Yellow activo. Limitador a ochenta, ahorra energía virtual y revisa ventana de boxes.",
      "FCY en pista, momento clave para ahorrar consumo y valorar estrategia.",
    ],
    "Bandera Azul": [
      "Bandera azul detrás. Cede en recta perdiendo las mínimas décimas posibles.",
      "Coche más rápido detrás con bandera azul, no pelees y protege tus gomas.",
    ],
    "Bandera Verde": [
      "Bandera verde. Retoma el ritmo objetivo del stint.",
      "Pista libre con bandera verde, vuelve a tiempos de estrategia.",
    ],
    "Entrada Boxes": [
      "Entrando a pit lane, velocidad exacta para evitar sanciones de tiempo.",
      "En calle de boxes, parada programada en marcha.",
    ],
    "Salida Boxes": [
      "Saliendo de boxes, cuidado con el tráfico de incorporación y gomas frías.",
      "Reincorporación a pista, dos curvas de adaptación para el nuevo juego.",
    ],
    "Salida Pit Lane": [
      "Fin de pit lane, limitador fuera. Empuja fuerte en vuelta de salida para consolidar el undercut.",
      "Limitador fuera, vuelta clave de estrategia, busca pista limpia.",
    ],
    "Box Esta Vuelta": [
      "Box en esta vuelta, ventana límite de combustible y energía virtual.",
      "Entra al final de esta vuelta, no llegamos a una más.",
    ],
    "Combustible Bajo": [
      "Dos vueltas de combustible restantes. Haz lift and coast si quieres estirar una vuelta extra.",
      "Combustible bajo, dos vueltas de autonomía, preparando parada.",
    ],
    "Frenos Calientes": [
      "Frenos en {temp} grados, retrasa el punto de frenada ligeramente para refrigerar.",
    ],
    "Desgaste Neumaticos": [
      "Degradación en {wheel} al {wear} por ciento, gestiona el ritmo del stint.",
    ],
    "Aviso Limites Pista": [
      "Alerta de límites de pista, siguiente infracción conlleva penalización.",
    ],
    "Energia Virtual Baja": [
      "Energía virtual al límite, {laps} vueltas restantes. Ventana de boxes abierta.",
    ],
    "Rival Boxes": [
      "{driver} ha parado en boxes. Empuja dos vueltas limpias para el overcut.",
    ],
    "Tiempo Restante": [
      "Restan {mins} minutos de carrera. Combustible y gomas bajo control.",
    ],
    "Motor Caliente": [
      "Temperatura de motor crítica, abre hueco del coche de delante.",
    ],
    "Coche Delante Cerca": [
      "{driver} a {gap} segundos, aprovecha el rebufo para ahorrar energía y adelantar.",
    ],
    "Presion Detras": [
      "{driver} detrás a {gap} segundos, protege la trazada óptima.",
    ],
    "Resumen Vuelta": [
      "P{place}, brecha de {gap} segundos con {driver}. Ritmo en objetivo.",
    ],
    "Bloqueo Repetido": [
      "Bloqueo repetido detectado en telemetría. {advice} para evitar plano en la goma.",
    ],
    "Lift And Coast": [
      "Estrategia: aplica lift and coast, ahorrando {laps} vueltas eliminamos la parada adicional.",
    ],
    "Final Remontada": [
      "Objetivo superado: {gained} posiciones ganadas hasta P{place}. Estrategia ejecutada a la perfección.",
    ],
    "Final Pesimista": [
      "Resultado por debajo de objetivo, P{place} tras ceder {lost} posiciones. Revisaremos ritmo y paradas en telemetría.",
    ],
    "Gomas en Ventana": [
      "Ventana térmica alcanzada en los cuatro neumáticos. Grip óptimo disponible.",
    ],
    "Caza Rival": [
      "Proyección de caza sobre {driver}: recortas {delta} por vuelta, contacto estimado en {laps}.",
    ],
    "Defensa Rival": [
      "Alerta de ritmo: {driver} recorta {delta} por vuelta desde atrás, contacto proyectado en {laps}.",
    ],
    "Animo Metronomo": [
      "Excelente consistencia en telemetría: {laps} vueltas consecutivas en ventana objetivo.",
    ],
    "Animo Tras Error": [
      "Incidente absorbido. Retoma tu ritmo base, la estrategia sigue viva.",
    ],
    "Animo Defensa Exitosa": [
      "Posición consolidada frente a {driver}. Brecha abierta, vuelve a gestionar consumo y gomas.",
    ],
    "Animo Remontada": [
      "Ganancia neta de {gained} posiciones hasta P{place}. Progresión muy por encima del objetivo.",
    ],
    "Animo Tramo Final": [
      "Fase final de carrera con margen para atacar. Ejecuta limpio hasta bandera a cuadros.",
    ],
    "Animo Stint Limpio": [
      "{laps} vueltas limpias consecutivas sin degradación extra. Stint muy eficiente.",
    ],
  },

  streamer_hype: {
    "Coche Izquierda": [
      "Ojo a la izquierda, hermano, que lo tienes pegado.",
      "Coche a la izquierda, no te cierres que nos vamos los dos al muro.",
      "Izquierda ocupada, deja espacio, crack.",
    ],
    "Coche Derecha": [
      "Coche a la derecha, espabila y aguanta tu carril.",
      "Lo tienes a la derecha, no me la líes ahora.",
      "Derecha ocupada, aguanta ahí como un titán.",
    ],
    "Tres en Paralelo": [
      "Madre mía, tres en paralelo, qué locura, no toques a nadie.",
      "Tres coches a la vez, si sales vivo de aquí te pongo una estatua.",
    ],
    "Libre": [
      "Libre, dale cera.",
      "Despejado, ya puedes cerrar sin miedo.",
      "Libre, a fondo hermano.",
    ],
    "Salida a Pista": [
      "A ver, crack, sales a pista. Demuéstrales quién manda aquí y no me estampes el coche en la vuelta uno.",
      "Radio activa, todo listo. Sal ahí fuera y revienta el crono, que te están mirando todos.",
      "Vamos a pista, hermano. Calienta esas ruedas y a dar espectáculo del bueno.",
    ],
    "Salida Carrera": [
      "Luces fuera, empieza la guerra. No me la líes en la primera curva y a por el liderato.",
      "Arrancamos, gas a tabla y cabeza, que esto se gana en pista.",
    ],
    "Bandera Amarilla": [
      "Eh, eh, bandera amarilla delante. Alguien la ha liado parda, levanta el pie.",
      "Bandera amarilla, hermano, cuidado que hay fiesta delante, no te metas en el lío.",
      "Ojo, amarilla en pista. Pasa limpio y no hagas ninguna barbaridad.",
    ],
    "Full Course Yellow": [
      "Full Course Yellow, todo el mundo a ochenta. Pon el limitador ya o nos cae un puro.",
      "Atención, Full Course Yellow. Frena a ochenta y aprovecha para secarte el sudor.",
    ],
    "Bandera Azul": [
      "Bandera azul, apártate que viene un misil por detrás.",
      "Ojo, bandera azul. Déjalo pasar sin dramas que no es nuestra guerra.",
      "Viene uno volando detrás con bandera azul, abre hueco y a seguir.",
    ],
    "Bandera Verde": [
      "Bandera verde, pista libre, pisa a fondo ya.",
      "Verde en pista, se acabó el paseo, a atacar.",
      "Bandera verde, dale fuego al acelerador.",
    ],
    "Bandera Negra": [
      "Nos han metido sanción, hermano. Qué manía nos tienen los comisarios.",
      "Penalización al canto, toca cumplirla con cabeza.",
    ],
    "Vuelta Cancelada": [
      "Vuelta anulada por irte por lo verde. Te pasaste de optimista, a por la siguiente.",
      "Te han borrado la vuelta por límites de pista. Mete el coche por lo negro, crack.",
    ],
    "Entrada Boxes": [
      "Entrando a boxes, clava el limitador que te conozco y nos comemos sanción.",
      "En pit lane, frena bien y no te pases el cajón.",
    ],
    "Salida Boxes": [
      "Saliendo de boxes, cuidado con pisar la línea blanca que los comisarios no perdonan.",
      "De vuelta a pista, ojo a los que vienen por la recta.",
    ],
    "Salida Pit Lane": [
      "Fin de pit lane, quita el limitador y a reventar el asfalto.",
      "Limitador fuera, hermano, gas a fondo y a remontar.",
    ],
    "Parada Exitosa": [
      "Qué paradón nos hemos marcado, ni en Fórmula Uno. Ruedas nuevas y a volar.",
      "Parada de diez, coche listo. Ahora enséñales de qué pasta estás hecho.",
    ],
    "Limitador Pit": [
      "Limitador puesto, perfecto.",
      "Limitador activado, así sí.",
    ],
    "Box Esta Vuelta": [
      "Entra a boxes ya en esta vuelta o nos quedamos tirados empujando el coche.",
      "Box ahora mismo, hermano, vas con los vapores de gasolina.",
    ],
    "Combustible Bajo": [
      "Ojo que quedan dos vueltas de gasolina, ve pensando en entrar a boxes.",
      "Depósito tiritando, dos vueltas de margen, no te despistes.",
    ],
    "Sector Verde": [
      "Sector {sector} en verde, estás on fire, sigue apretando.",
      "Toma ya, sector {sector} en verde, vas como un tiro.",
    ],
    "Sector Purpura": [
      "Sector {sector} en púrpura, pero qué barbaridad estás haciendo, estás loco.",
      "Récord absoluto en el sector {sector}, apaga y vámonos, qué nivel.",
    ],
    "Mejor Vuelta": [
      "Vueltón histórico, mejor tiempo personal. Qué escándalo.",
      "Has reventado tu mejor vuelta, sigue así que los dejas atrás.",
    ],
    "Posicion Ganada": [
      "Vaya pasada le acabas de meter, ya eres P{place}. A abrir hueco.",
      "Adelantamiento de libro, P{place}. Que aprendan cómo se pilota.",
    ],
    "Posicion Perdida": [
      "Te la han colado, bajas a P{place}. Pégate a su trasero y devuélvesela ya.",
      "Bajas a P{place}, no te calientes que en dos vueltas lo pasas por encima.",
    ],
    "Daños Coche": [
      "Uf, golpe duro, tenemos daños en el coche. Mira si gira bien o toca pasar por boxes.",
      "Nos han dejado el coche tocado, aguanta como puedas y dime cómo va.",
    ],
    "Lluvia Inminente": [
      "Empieza a llover, hermano. Se viene el caos, cuidadito con los pianos.",
      "Gotas en el parabrisas, se pone divertida la carrera, cabeza en frenada.",
    ],
    "Victoria": [
      "Vamos, victoria, P1. Qué exhibición acabas de dar, eres el jefe absoluto de la pista.",
    ],
    "Podio": [
      "Bandera a cuadros y podio en P{place}. Carrerón espectacular, a celebrarlo.",
    ],
    "Frenos Calientes": [
      "Hermano, llevas los frenos ardiendo a {temp} grados, vas a fundir los discos.",
      "Frenos a {temp} grados, espabila y refrigera un poco en recta.",
    ],
    "Desgaste Neumaticos": [
      "Ojo que la {wheel} está al {wear} por ciento, te vas a quedar en los alambres.",
      "La {wheel} pide auxilio al {wear} por ciento, no la maltrates más.",
    ],
    "Aviso Limites Pista": [
      "Deja de irte por lo verde, hermano, un aviso más y nos meten sanción.",
      "Estás a un pelo de penalización por límites de pista, mete el coche dentro.",
    ],
    "Energia Virtual Baja": [
      "Te quedan {laps} vueltas de energía virtual, ve preparando la entrada a boxes.",
    ],
    "Rival Boxes": [
      "{driver} se acaba de meter a boxes. Pista limpia, revienta el crono ahora.",
      "Se quita de en medio {driver} entrando a boxes, a volar hermano.",
    ],
    "Tiempo Restante": [
      "Quedan {mins} minutos, crack. A darlo todo que esto se acaba.",
      "Últimos {mins} minutos de carrera, prohibido fallar ahora.",
    ],
    "Motor Caliente": [
      "El motor está echando humo, sal del rebufo o nos quedamos fritos.",
    ],
    "Coche Delante Cerca": [
      "Tienes a {driver} a {gap} segundos, pásalo por encima ya.",
      "{driver} a {gap} segundos delante, dale susto en la frenada.",
    ],
    "Presion Detras": [
      "Viene {driver} pegado a {gap} segundos detrás, cierra la puerta como un muro.",
      "{driver} a {gap} segundos en el retrovisor, no le regales ni un metro.",
    ],
    "Resumen Vuelta": [
      "Vas P{place}, {driver} delante a {gap} segundos. Sigue apretando, crack.",
    ],
    "Bloqueo Repetido": [
      "Otra vez clavando ruedas, hermano. {advice} o vas a dejar las gomas cuadradas.",
    ],
    "Lift And Coast": [
      "Haz lift and coast en recta, crack. Si ahorras {laps} vueltas no paramos más y les ganamos la jugada.",
    ],
    "Final Remontada": [
      "Pero qué remontada te has marcado, hermano, {gained} puestos arriba hasta P{place}. Enhorabuena, estás en otro nivel.",
      "Brutal, {gained} posiciones ganadas hasta P{place}. Les has pasado por encima a todos, crack.",
    ],
    "Final Pesimista": [
      "Menudo desastre de carrera, hermano. Hemos perdido {lost} posiciones hasta P{place}, mejor apaga el coche y vámonos a casa.",
      "P{place}, {lost} puestos abajo. Hoy nos han dado un repaso curioso, a entrenar más para la próxima.",
    ],
    "Gomas en Ventana": [
      "Gomas calientes y en ventana, hermano. Ya tienes agarre total, pisa a tabla.",
      "Ruedas en temperatura óptima, crack, se acabó calentar, a volar.",
    ],
    "Caza Rival": [
      "Le estás metiendo {delta} por vuelta a {driver}, hermano. En {laps} te lo comes con patatas.",
    ],
    "Defensa Rival": [
      "Ojo que {driver} viene enchufado, {delta} más rápido por vuelta. En {laps} lo tienes en el cogote, cierra el chiringuito.",
    ],
    "Animo Metronomo": [
      "Pero qué máquina eres, hermano, {laps} vueltas seguidas calcadas al milímetro. Estás intratable.",
    ],
    "Animo Tras Error": [
      "No pasa nada, hermano, sacúdete el polvo y gas a fondo. Eso lo recuperamos en dos vueltas.",
    ],
    "Animo Defensa Exitosa": [
      "Qué muro le has puesto a {driver}, crack. Se ha aburrido de verte el alerón, ahora a tirar.",
    ],
    "Animo Remontada": [
      "Ya van {gained} puestos arriba hasta P{place}, hermano. Los estás dejando a todos sentados.",
    ],
    "Animo Tramo Final": [
      "Últimos minutos, crack, saca todo lo que llevas dentro que esta pelea es nuestra.",
    ],
    "Animo Stint Limpio": [
      "{laps} vueltas seguidas sin un solo fallo, hermano. Qué clase tienes conduciendo, sigue así.",
    ],
  },
};

const lastIndexByKey = new Map<string, number>();

/** Returns all unique static (non-placeholder) phrases for a given personality so MDT-QWEN can pre-cache them all. */
export function getStaticPhrasesForPersonality(
  personality: EngineerPersonality | undefined,
  customPersonalities?: Record<string, { phrases: Record<string, string[]> }>,
): string[] {
  const p = personality || "wec_pro";
  const customBank = customPersonalities?.[p]?.phrases;
  const builtInBank = p in PHRASES ? PHRASES[p] : undefined;
  const merged: PhraseBank = { ...PHRASES.wec_pro, ...(builtInBank ?? {}), ...(customBank ?? {}) };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of Object.values(merged)) {
    if (!list) continue;
    for (const phrase of list) {
      if (phrase.includes("{")) continue; // skip dynamic-token templates
      const clean = phrase.trim();
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
      }
    }
  }
  return out;
}

/** Events where reaction time is critical (<0.4s) — never delay them by inserting the driver's name. */
const SKIP_NAME_INJECTION_EVENTS = new Set([
  "Coche Izquierda",
  "Coche Derecha",
  "Tres en Paralelo",
  "Libre",
  "Limitador Pit",
]);

/** Dedicated natural radio phrasing templates when the driver's name is injected on iconic calls. */
const NAMED_EVENT_VARIANTS: Partial<Record<string, string[]>> = {
  "Bandera Azul": [
    "Bandera azul. {name}, cuidado detrás.",
    "Bandera azul, {name}, coche rápido detrás.",
    "{name}, bandera azul, facilita el paso en la próxima recta.",
  ],
  "Bandera Amarilla": [
    "Bandera amarilla. {name}, precaución delante.",
    "{name}, atención, bandera amarilla en pista.",
  ],
  "Full Course Yellow": [
    "Full Course Yellow. {name}, reduce a ochenta y activa el limitador.",
    "{name}, Full Course Yellow activo, controla la velocidad.",
  ],
  "Box Esta Vuelta": [
    "Box esta vuelta, {name}, combustible crítico.",
    "{name}, entra a boxes en esta vuelta.",
  ],
  "Salida a Pista": [
    "Radio check, {name}, te recibo alto y claro. Calienta gomas con calma.",
    "En pista, {name}. Todo correcto en telemetría, construye el ritmo paso a paso.",
  ],
  "Mejor Vuelta": [
    "¡Gran vuelta, {name}! Mejor tiempo personal.",
    "¡Vueltón, {name}! Has bajado tu mejor marca.",
  ],
  "Ultima Vuelta": [
    "Última vuelta, {name}, dalo todo hasta la bandera.",
    "{name}, última vuelta de carrera, máxima concentración.",
  ],
  "Victoria": [
    "¡Siii, {name}! ¡Victoria! ¡P1! Qué carrerón te has marcado.",
    "¡Bandera a cuadros, {name}! ¡Ganamos la carrera, P1! Increíble trabajo.",
  ],
  "Podio": [
    "¡Podio, {name}! P{place}, fantástico trabajo hoy en pista.",
  ],
  "Gomas en Ventana": [
    "Gomas en ventana, {name}, ya tienes grip para empujar.",
    "{name}, neumáticos en temperatura óptima, ya puedes apretar.",
  ],
  "Caza Rival": [
    "{name}, le estás recortando {delta} por vuelta a {driver}. En {laps} estás encima.",
  ],
  "Defensa Rival": [
    "{name}, ojo que {driver} viene {delta} más rápido por vuelta. Prepara defensa en {laps}.",
  ],
  "Animo Metronomo": [
    "Qué metrónomo, {name}, {laps} vueltas seguidas clavadas. Estás volando con cabeza.",
  ],
  "Animo Tras Error": [
    "Cabeza fría, {name}, eso ya pasó. Queda mucha carrera, resetea y vuelve a tu ritmo.",
  ],
  "Animo Defensa Exitosa": [
    "¡Qué gran defensa, {name}! Has descolgado a {driver}, ahora respira y marca tu ritmo.",
  ],
  "Animo Remontada": [
    "Ya llevas {gained} puestos ganados, {name}, menuda remontada hasta P{place}. Sigue así.",
  ],
  "Animo Tramo Final": [
    "Recta final de carrera, {name}, máxima concentración. Tú puedes con esto.",
  ],
  "Animo Stint Limpio": [
    "{laps} vueltas seguidas sin un fallo, {name}. Stint de libro, mantén el foco.",
  ],
};

function injectDriverNameNaturally(
  text: string,
  folder: string,
  driverName: string,
  frequency: number,
  context?: SpotterEventContext,
): string {
  const cleanName = driverName.trim();
  if (!cleanName) return text.replace(/\{name\}/g, "").replace(/\s{2,}/g, " ").trim();

  // If the phrase already contains an explicit {name} token, always substitute it
  if (text.includes("{name}")) {
    return text.replace(/\{name\}/g, cleanName);
  }

  if (SKIP_NAME_INJECTION_EVENTS.has(folder)) return text;
  const prob = Math.max(0, Math.min(1, frequency));
  if (prob <= 0 || Math.random() > prob) return text;

  // Prefer tailored natural radio variants for iconic events when available
  const namedPool = NAMED_EVENT_VARIANTS[folder];
  if (namedPool && namedPool.length > 0 && Math.random() < 0.72) {
    let pick = namedPool[Math.floor(Math.random() * namedPool.length)].replace(/\{name\}/g, cleanName);
    const pos = context?.classPlace || context?.place;
    if (pos) pick = pick.replace(/\{place\}/g, String(pos));
    if (context?.driver) pick = pick.replace(/\{driver\}/g, context.driver);
    if (context?.delta) pick = pick.replace(/\{delta\}/g, context.delta);
    if (context?.laps) pick = pick.replace(/\{laps\}/g, context.laps);
    if (context?.gained != null) pick = pick.replace(/\{gained\}/g, String(context.gained));
    return pick;
  }

  // Otherwise weave the driver's name organically into the existing sentence
  const trimmed = text.trim();
  // Pattern 1: "Short lead-in, rest..." -> "Short lead-in. Miguel, rest..."
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx > 2 && commaIdx <= 24 && !trimmed.startsWith("¡")) {
    const head = trimmed.slice(0, commaIdx).trim();
    const rest = trimmed.slice(commaIdx + 1).trim();
    if (rest.length > 4) {
      return `${head}. ${cleanName}, ${rest}`;
    }
  }

  // Pattern 2: Opening or closing vocative
  if (Math.random() < 0.55) {
    // Opening: "Miguel, <lowercase start>" (unless starts with ¡ or acronym like P1/FCY)
    const keepCap = /^(¡|¿|P\d|FCY|DRS|ABS|TC|ERS|VE\b)/.test(trimmed);
    const body = keepCap ? trimmed : trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
    return `${cleanName}, ${body}`;
  } else {
    // Closing: "<sentence>, Miguel."
    const endPunct = /[.!?]$/.test(trimmed) ? trimmed.slice(-1) : ".";
    const stem = /[.!?]$/.test(trimmed) ? trimmed.slice(0, -1).trim() : trimmed;
    return `${stem}, ${cleanName}${endPunct}`;
  }
}

/**
 * Picks a varied phrase matching the active engineer personality (built-in or custom) without repeating the previous one.
 * Falls back cleanly to `wec_pro` and then to `fallbackText`.
 */
export function pickSpotterPhrase(
  folder: string,
  personality: EngineerPersonality | undefined,
  fallbackText: string,
  context?: SpotterEventContext,
  customPersonalities?: Record<string, { phrases: Record<string, string[]> }>,
  driverName?: string,
  driverNameFrequency = 0.35,
): string {
  const p = personality || "wec_pro";
  const customPool = customPersonalities?.[p]?.phrases?.[folder]?.filter((s) => s.trim().length > 0);
  const builtInPool = p in PHRASES ? PHRASES[p]?.[folder] : undefined;
  const pool = (customPool && customPool.length > 0 ? customPool : null) ?? builtInPool ?? PHRASES.wec_pro?.[folder];
  let chosen = fallbackText;
  if (pool && pool.length > 0) {
    if (pool.length === 1) {
      chosen = pool[0];
    } else {
      const key = `${p}::${folder}`;
      const prev = lastIndexByKey.get(key) ?? -1;
      let idx = Math.floor(Math.random() * pool.length);
      if (idx === prev) {
        idx = (idx + 1) % pool.length;
      }
      lastIndexByKey.set(key, idx);
      chosen = pool[idx];
    }
  }
  const pos = context?.classPlace || context?.place;
  if (pos) chosen = chosen.replace(/\{place\}/g, String(pos));
  if (context?.sector != null) chosen = chosen.replace(/\{sector\}/g, String(context.sector));
  if (context?.driver) chosen = chosen.replace(/\{driver\}/g, context.driver);
  if (context?.gap) chosen = chosen.replace(/\{gap\}/g, context.gap);
  if (context?.temp != null) chosen = chosen.replace(/\{temp\}/g, String(context.temp));
  if (context?.wear != null) chosen = chosen.replace(/\{wear\}/g, String(context.wear));
  if (context?.wheel) chosen = chosen.replace(/\{wheel\}/g, context.wheel);
  if (context?.mins != null) chosen = chosen.replace(/\{mins\}/g, String(context.mins));
  if (context?.laps) chosen = chosen.replace(/\{laps\}/g, context.laps);
  if (context?.advice) chosen = chosen.replace(/\{advice\}/g, context.advice);
  if (context?.gained != null) chosen = chosen.replace(/\{gained\}/g, String(context.gained));
  if (context?.lost != null) chosen = chosen.replace(/\{lost\}/g, String(context.lost));
  if (context?.delta) chosen = chosen.replace(/\{delta\}/g, context.delta);
  if (driverName && driverName.trim()) {
    chosen = injectDriverNameNaturally(chosen, folder, driverName, driverNameFrequency, context);
  } else {
    chosen = chosen.replace(/\{name\}/g, "").replace(/\s{2,}/g, " ").trim();
  }
  return chosen;
}
