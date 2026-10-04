import SwiftUI
import EventKit
import EventKitUI
import UserNotifications
import MaratonKit

/// El horario de maratón guardado en el teléfono y sus avisos. Donde la web
/// solo podía avisar «hoy hay sesión» desde el service worker, aquí cada aviso
/// dice qué toca: se programan las próximas sesiones con su contenido y se
/// rehacen al marcar, al cambiar el horario o al volver a la app.
@MainActor @Observable
final class Agenda {
    var horario: Horario? { didSet { guardaHorario() } }
    /// Avisar 15 minutos antes de cada sesión
    var avisos: Bool { didSet { UserDefaults.standard.set(avisos, forKey: Self.claveAvisos) } }

    private static let claveHorario = "horario"
    private static let claveAvisos = "avisosSesion"
    /// Los avisos que programa la app llevan este prefijo (y solo esos se borran)
    private static let prefijo = "sesion-"
    /// Cuántas sesiones por delante: iOS guarda hasta 64 avisos por app
    private static let porDelante = 8
    static let antelacion = 15

    init() {
        let d = UserDefaults.standard
        // como saneaHorario: lo que no se lee bien se descarta entero
        horario = d.data(forKey: Self.claveHorario)
            .flatMap { try? JSONDecoder().decode(Horario.self, from: $0) }?.saneado
        avisos = d.object(forKey: Self.claveAvisos) as? Bool ?? true
    }

    private func guardaHorario() {
        let d = UserDefaults.standard
        if let horario, let datos = try? JSONEncoder().encode(horario) {
            d.set(datos, forKey: Self.claveHorario)
        } else {
            d.removeObject(forKey: Self.claveHorario)
        }
    }

    /// Pide permiso de avisos; si lo niegan, se apagan (el interruptor no miente)
    func pidePermiso() async -> Bool {
        let ok = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if !ok { avisos = false }
        return ok
    }

    /// Borra los avisos de sesión y programa los de las próximas sesiones con lo
    /// que toca en cada una. Sin horario, sin avisos o sin permiso, solo borra.
    func reprograma(progreso: Progreso, ajustes: Ajustes, ahora: Date = Date()) async {
        let centro = UNUserNotificationCenter.current()
        let viejos = await centro.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.prefijo) }
        centro.removePendingNotificationRequests(withIdentifiers: viejos)
        guard avisos, let h = horario,
              await centro.notificationSettings().authorizationStatus == .authorized else { return }
        let cal = Calendar.current
        let sim = progreso.simula(h, desde: h.primerDia(ahora: ahora, cal), calendario: cal, detalladas: Self.porDelante)
        for s in sim.sesiones where !s.trozos.isEmpty {
            let aviso = h.inicio(el: s.fecha, cal).addingTimeInterval(-Double(Self.antelacion) * 60)
            guard aviso > ahora else { continue }
            let c = UNMutableNotificationContent()
            c.title = ajustes.tr("Tu sesión empieza en \(Self.antelacion) min", "Your session starts in \(Self.antelacion) min")
            c.body = Self.contenido(s, progreso.catalogo, ajustes)
            c.sound = .default
            c.threadIdentifier = "sesion"
            let cuando = cal.dateComponents([.year, .month, .day, .hour, .minute], from: aviso)
            let id = Self.prefijo + String(Int(s.fecha.timeIntervalSince1970))
            try? await centro.add(UNNotificationRequest(identifier: id, content: c,
                                                        trigger: UNCalendarNotificationTrigger(dateMatching: cuando, repeats: false)))
        }
    }

    /// «Logan + Deadpool 2» o «Loki (T1·E1–T1·E3)»
    static func contenido(_ s: SesionHorario, _ catalogo: Catalogo, _ ajustes: Ajustes) -> String {
        s.trozos.map { t in
            let n = catalogo.nombre(t.titulo, en: ajustes.idioma), e = t.episodios(en: ajustes.idioma)
            return e.isEmpty ? n : "\(n) (\(e))"
        }.joined(separator: " + ")
    }

    /// El horario entero como UN evento semanal, igual que el .ics de la web:
    /// los días elegidos, hasta el día en que terminas y aviso 15 min antes
    static func evento(_ h: Horario, _ sim: SimulacionHorario, en almacen: EKEventStore, _ ajustes: Ajustes) -> EKEvent? {
        guard let primera = sim.sesiones.first, let fin = sim.fin else { return nil }
        let cal = Calendar.current
        let e = EKEvent(eventStore: almacen)
        e.title = ajustes.tr("Sesión de maratón Marvel", "Marvel marathon session")
        e.startDate = h.inicio(el: primera.fecha, cal)
        e.endDate = e.startDate.addingTimeInterval(Double(h.min) * 60)
        e.notes = ajustes.tr("\(Formato.duracion(h.min)) siguiendo el orden del maratón. La app dice qué toca cada día.",
                             "\(Formato.duracion(h.min)) following the marathon order. The app says what’s up each day.")
        // EKWeekday cuenta desde el domingo = 1; la web desde el domingo = 0
        let dias = h.dias.sorted().compactMap { EKWeekday(rawValue: $0 + 1) }.map { EKRecurrenceDayOfWeek($0) }
        let hasta = cal.date(bySettingHour: 23, minute: 59, second: 59, of: fin) ?? fin
        e.recurrenceRules = [EKRecurrenceRule(recurrenceWith: .weekly, interval: 1, daysOfTheWeek: dias, daysOfTheMonth: nil,
                                              monthsOfTheYear: nil, weeksOfTheYear: nil, daysOfTheYear: nil,
                                              setPositions: nil, end: EKRecurrenceEnd(end: hasta))]
        e.addAlarm(EKAlarm(relativeOffset: -Double(antelacion) * 60))
        return e
    }
}

/// La hoja del sistema para añadir un evento al Calendario. Desde iOS 17 no
/// pide permiso: el evento solo se guarda si la persona toca «Añadir».
struct EditorEvento: UIViewControllerRepresentable {
    let evento: EKEvent
    let almacen: EKEventStore
    let alTerminar: (EKEventEditViewAction) -> Void

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let vc = EKEventEditViewController()
        vc.eventStore = almacen
        vc.event = evento
        vc.editViewDelegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: EKEventEditViewController, context: Context) {}

    func makeCoordinator() -> Coordinador { Coordinador(alTerminar: alTerminar) }

    final class Coordinador: NSObject, EKEventEditViewDelegate {
        let alTerminar: (EKEventEditViewAction) -> Void
        init(alTerminar: @escaping (EKEventEditViewAction) -> Void) { self.alTerminar = alTerminar }
        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
            alTerminar(action)
        }
    }
}
