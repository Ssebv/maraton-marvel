import SwiftUI
import UserNotifications
import MaratonKit

/// Tocar un aviso de estreno abre la ficha (por el mismo maraton://abrir del
/// widget); con la app abierta, el aviso se ve igual arriba
final class DelegadoAvisos: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse) async {
        guard let id = r.notification.request.content.userInfo["id"] as? String,
              let url = URL(string: "maraton://abrir?id=\(id)") else { return }
        await MainActor.run { UIApplication.shared.open(url) }
    }
}

@main
struct MaratonApp: App {
    @State private var app = EstadoApp.carga()
    private let delegado = DelegadoAvisos()

    init() {
        // los fotogramas de TMDB se piden una vez y quedan en disco
        URLCache.shared = URLCache(memoryCapacity: 30 << 20, diskCapacity: 300 << 20)
        UNUserNotificationCenter.current().delegate = delegado
    }

    var body: some Scene {
        WindowGroup {
            switch app {
            case let .listo(catalogo, progreso, ajustes, agenda, biblioteca):
                RaizView()
                    .environment(progreso)
                    .environment(biblioteca)
                    .environment(ajustes)
                    .environment(agenda)
                    .environment(\.catalogo, catalogo)
                    .tint(Tema.rojo)
            case let .error(mensaje):
                ContentUnavailableView("No se pudieron cargar los datos", systemImage: "exclamationmark.triangle",
                                       description: Text(mensaje))
            }
        }
    }
}

enum EstadoApp {
    case listo(Catalogo, Progreso, Ajustes, Agenda, Biblioteca)
    case error(String)

    @MainActor static func carga() -> EstadoApp {
        do {
            let c = try Catalogo.cargar()
            return .listo(c, Progreso(catalogo: c), Ajustes(paises: c.paises), Agenda(), Biblioteca())
        } catch {
            return .error(String(describing: error))
        }
    }
}

extension EnvironmentValues {
    @Entry var catalogo: Catalogo? = nil
}

/// La ficha que está abierta, compartida por todas las pestañas
@MainActor @Observable
final class Navegacion {
    var ficha: Titulo? { didSet { if ficha?.id != oldValue?.id { rutaFicha = NavigationPath() } } }
    /// Lo apilado dentro de la hoja de la ficha (personas y sus títulos)
    var rutaFicha = NavigationPath()
    var horarioAbierto = false
    var pestana = Navegacion.pestanaInicial
    var aviso: String?
    /// «Desde tu última visita: …» (se calcula una vez al abrir la app)
    var novedades: [String] = []
    /// El logro recién desbloqueado (aviso arriba) y cuántos más a la vez
    var logroNuevo: Logro?
    var logrosMas = 0
    /// Los ya anunciados en esta sesión: perder un logro y recuperarlo
    /// (borrar una reseña y volver a escribirla) no repite el aviso
    @ObservationIgnored var anunciados: Set<String> = []
    enum Pestana: String, Hashable { case inicio, cronologia, multiverso, progreso, ajustes }

    /// En depuración, `-pestana cronologia` al lanzar (capturas del simulador)
    static var pestanaInicial: Pestana {
        #if DEBUG
        UserDefaults.standard.string(forKey: "pestana").flatMap(Pestana.init(rawValue:)) ?? .inicio
        #else
        .inicio
        #endif
    }
}

struct RaizView: View {
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Agenda.self) private var agenda
    @Environment(\.scenePhase) private var fase
    @State private var nav = Navegacion()

    var body: some View {
        @Bindable var nav = nav
        TabView(selection: $nav.pestana) {
            Tab(ajustes.tr("Inicio", "Home"), systemImage: "house.fill", value: .inicio) { InicioView().entradaPestana(.inicio) }
            Tab(ajustes.tr("Cronología", "Timeline"), systemImage: "film.stack.fill", value: .cronologia) { CronologiaView().entradaPestana(.cronologia) }
            Tab(ajustes.tr("Multiverso", "Multiverse"), systemImage: "globe.americas.fill", value: .multiverso) { MultiversoView().entradaPestana(.multiverso) }
            Tab(ajustes.tr("Progreso", "Progress"), systemImage: "chart.bar.fill", value: .progreso) { ProgresoView().entradaPestana(.progreso) }
            Tab(ajustes.tr("Ajustes", "Settings"), systemImage: "gearshape.fill", value: .ajustes) { AjustesView().entradaPestana(.ajustes) }
        }
        // como en Norte: la barra se recoge al bajar y encima va el siguiente título
        .tint(Tema.rojo)
        .tabBarMinimizeBehavior(.onScrollDown)
        .tabViewBottomAccessory { AccesorioSiguiente() }
        .modifier(CapaAvisoLogro(visible: nav.ficha == nil))
        .environment(nav)
        .sheet(item: $nav.ficha) { t in
            // con su navegación: el reparto abre la página de cada persona y
            // sus títulos abren su ficha encima, con «volver»
            NavigationStack(path: $nav.rutaFicha) {
                FichaView(titulo: t)
                    .navigationDestination(for: RutaPersona.self) { PersonaView(ruta: $0) }
                    .navigationDestination(for: Titulo.self) { FichaView(titulo: $0, apilada: true) }
            }
                .modifier(CapaAvisoLogro())
                .environment(nav)
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $nav.horarioAbierto) { HorarioView() }
        // los avisos de sesión dicen qué toca: se rehacen al marcar, al cambiar
        // el horario o el idioma y al volver a la app (puede haber cambiado el día)
        .task(id: claveAvisos) {
            // en primer plano, con un segundo de espera (marcar varios seguidos);
            // al irse a segundo plano, al momento: lo último marcado ya cuenta
            if fase == .active {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
            }
            await agenda.reprograma(progreso: progreso, ajustes: ajustes)
            await agenda.reprogramaEstrenos(progreso: progreso, ajustes: ajustes)
            PuenteWidget.publica(progreso: progreso, ajustes: ajustes, agenda: agenda)
        }
        .alert(nav.aviso ?? "", isPresented: Binding(get: { nav.aviso != nil }, set: { if !$0 { nav.aviso = nil } })) {
            Button("OK", role: .cancel) {}
        }
        #if DEBUG
        // Para capturas en el simulador: `simctl launch … -pestana cronologia -abrir dofp`
        .task {
            let d = UserDefaults.standard
            if let id = d.string(forKey: "abrir") { nav.ficha = progreso.catalogo.titulo(id) }
            // `-marcarSiguiente YES`: marca el siguiente a los 3 s (¿se redibuja el accesorio?)
            if d.bool(forKey: "marcarSiguiente") {
                try? await Task.sleep(for: .seconds(3))
                if let t = progreso.siguiente() { progreso.alternar(t.id) }
            }
            // `-abrir x2 -abrirPersona "Hugh Jackman"`
            if let p = d.string(forKey: "abrirPersona") {
                nav.rutaFicha.append(RutaPersona(nombre: p, esDireccion: false, desde: nav.ficha?.id))
            }
            if d.bool(forKey: "abrirHorario") { nav.horarioAbierto = true }
            if let s = d.string(forKey: "importar"), let url = URL(string: s) { importa(url) }
            if d.bool(forKey: "capturaWidget") {
                PuenteWidget.publica(progreso: progreso, ajustes: ajustes, agenda: agenda)
                CapturaWidget.dibuja()
            }
        }
        #endif
        .task {
            var ahora = Date()
            #if DEBUG
            // capturas: `-hoyDepuracion 2026-10-15 -ultimaVisita 2026-10-01`
            if let f = UserDefaults.standard.string(forKey: "hoyDepuracion").flatMap(Fecha.dia) { ahora = f }
            #endif
            nav.novedades = Avisos.desdeTuUltimaVisita(progreso, ajustes, ahora: ahora)
        }
        // maraton://importar?v=…&e=… (el enlace «Pasar al iPhone» de la web)
        .onOpenURL(perform: importa)
        .onChange(of: conseguidos) { antes, ahora in
            let nuevos = progreso.logros().filter { ahora.contains($0.id) && !antes.contains($0.id) && !nav.anunciados.contains($0.id) }
            nav.anunciados.formUnion(nuevos.map(\.id))
            guard let primero = nuevos.first else { return }
            nav.logroNuevo = primero
            nav.logrosMas = nuevos.count - 1
        }
        .task(id: nav.logroNuevo?.id) {
            guard nav.logroNuevo != nil else { return }
            try? await Task.sleep(for: .seconds(3.5))
            nav.logroNuevo = nil
        }
    }

    private struct ClaveAvisos: Hashable {
        let horario: Horario?, avisos: Bool, estrenos: Bool, vistas: Int, eps: Int, idioma: Idioma, activa: Bool
    }
    private var claveAvisos: ClaveAvisos {
        ClaveAvisos(horario: agenda.horario, avisos: agenda.avisos, estrenos: agenda.avisosEstrenos, vistas: Set(progreso.vistas.keys).hashValue,
                    eps: Set(progreso.eps.keys).hashValue, idioma: ajustes.idioma, activa: fase == .active)
    }

    private var conseguidos: Set<String> { Set(progreso.logros().filter(\.conseguido).map(\.id)) }

    private func importa(_ url: URL) {
        // maraton://abrir?id=… (tocar el widget)
        if let id = Enlace.abrir(url) {
            nav.ficha = progreso.catalogo.titulo(id)
            return
        }
        guard let (v, e) = Enlace.lee(url) else { return }
        let r = progreso.importa(v: v, e: e)
        nav.aviso = Avisos.importado(r, ajustes)
    }
}

enum Enlace {
    /// Acepta el enlace maraton://importar?v=…&e=… o el mismo texto pegado
    static func lee(_ url: URL) -> (String, String)? {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              c.scheme == "maraton", c.host == "importar" else { return nil }
        let q = Dictionary((c.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
        let v = q["v"] ?? "", e = q["e"] ?? ""
        return v.isEmpty && e.isEmpty ? nil : (v, e)
    }

    /// maraton://abrir?id=… → el id del título
    static func abrir(_ url: URL) -> String? {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              c.scheme == "maraton", c.host == "abrir" else { return nil }
        return c.queryItems?.first { $0.name == "id" }?.value
    }

    static func crea(v: String, e: String) -> URL? {
        var c = URLComponents()
        c.scheme = "maraton"
        c.host = "importar"
        c.queryItems = [URLQueryItem(name: "v", value: v), URLQueryItem(name: "e", value: e)]
        return c.url
    }
}

enum Avisos {
    /// El nombre de un estreno: el del título si está en el catálogo
    @MainActor static func nombre(_ e: Estreno, _ catalogo: Catalogo, _ ajustes: Ajustes) -> String {
        e.id.flatMap { catalogo.titulo($0) }.map { catalogo.nombre($0, en: ajustes.idioma) }
            ?? catalogo.texto(e.t, en: ajustes.idioma) ?? e.t
    }

    /// Como Novedades de la web: lo estrenado desde el último día que abriste la
    /// app (hasta 4). Guarda hoy como la última visita.
    @MainActor static func desdeTuUltimaVisita(_ progreso: Progreso, _ ajustes: Ajustes, ahora: Date = Date()) -> [String] {
        let d = UserDefaults.standard, clave = "ultimaVisita"
        let hoy = Catalogo.diaTexto(ahora)
        let antes = d.string(forKey: clave)
        d.set(hoy, forKey: clave)
        guard let antes, antes < hoy else { return [] }
        let c = progreso.catalogo
        return c.novedades(desde: antes, hasta: hoy, seguidas: progreso.seriesSeguidas).prefix(4).map { n in
            switch n {
            case let .estreno(e): ajustes.tr("\(nombre(e, c, ajustes)) ya se estrenó", "\(nombre(e, c, ajustes)) is out now")
            case let .episodios(t, k):
                k == 1 ? ajustes.tr("\(c.nombre(t, en: ajustes.idioma)): 1 episodio nuevo", "\(c.nombre(t, en: ajustes.idioma)): 1 new episode")
                       : ajustes.tr("\(c.nombre(t, en: ajustes.idioma)): \(k) episodios nuevos", "\(c.nombre(t, en: ajustes.idioma)): \(k) new episodes")
            }
        }
    }

    /// «Progreso importado: N títulos y N episodios nuevos» (y las notas, si llegaron)
    @MainActor static func importado(_ r: Progreso.Importado, _ ajustes: Ajustes) -> String {
        let notas = r.notas > 0 ? ajustes.tr(" y \(r.notas) notas", ", \(r.notas) ratings") : ""
        let lecturas = r.lecturas > 0 ? ajustes.tr(" y \(r.lecturas) cómics a medias", ", \(r.lecturas) comics in progress") : ""
        let listas = r.listas == 0 ? "" : r.listas == 1 ? ajustes.tr(" y 1 lista", ", 1 list") : ajustes.tr(" y \(r.listas) listas", ", \(r.listas) lists")
        return ajustes.tr("Progreso importado: \(r.titulos) títulos, \(r.episodios) episodios nuevos\(notas)\(lecturas)\(listas).",
                          "Progress imported: \(r.titulos) titles, \(r.episodios) new episodes\(notas)\(lecturas)\(listas).")
    }
}
