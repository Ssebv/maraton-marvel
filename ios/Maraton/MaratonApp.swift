import SwiftUI
import MaratonKit

@main
struct MaratonApp: App {
    @State private var app = EstadoApp.carga()

    init() {
        // los fotogramas de TMDB se piden una vez y quedan en disco
        URLCache.shared = URLCache(memoryCapacity: 30 << 20, diskCapacity: 300 << 20)
    }

    var body: some Scene {
        WindowGroup {
            switch app {
            case let .listo(catalogo, progreso, ajustes):
                RaizView()
                    .environment(progreso)
                    .environment(ajustes)
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
    case listo(Catalogo, Progreso, Ajustes)
    case error(String)

    @MainActor static func carga() -> EstadoApp {
        do {
            let c = try Catalogo.cargar()
            return .listo(c, Progreso(catalogo: c), Ajustes(paises: c.paises))
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
    var ficha: Titulo?
    var pestana = Navegacion.pestanaInicial
    var aviso: String?
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
    @State private var nav = Navegacion()

    var body: some View {
        @Bindable var nav = nav
        TabView(selection: $nav.pestana) {
            Tab(ajustes.tr("Inicio", "Home"), systemImage: "house", value: .inicio) { InicioView() }
            Tab(ajustes.tr("Cronología", "Timeline"), systemImage: "list.bullet", value: .cronologia) { CronologiaView() }
            Tab(ajustes.tr("Multiverso", "Multiverse"), systemImage: "globe", value: .multiverso) { MultiversoView() }
            Tab(ajustes.tr("Progreso", "Progress"), systemImage: "chart.bar", value: .progreso) { ProgresoView() }
            Tab(ajustes.tr("Ajustes", "Settings"), systemImage: "gearshape", value: .ajustes) { AjustesView() }
        }
        .modifier(CapaAvisoLogro(visible: nav.ficha == nil))
        .environment(nav)
        .sheet(item: $nav.ficha) { t in
            FichaView(titulo: t)
                .modifier(CapaAvisoLogro())
                .environment(nav)
                .presentationDragIndicator(.visible)
        }
        .alert(nav.aviso ?? "", isPresented: Binding(get: { nav.aviso != nil }, set: { if !$0 { nav.aviso = nil } })) {
            Button("OK", role: .cancel) {}
        }
        #if DEBUG
        // Para capturas en el simulador: `simctl launch … -pestana cronologia -abrir dofp`
        .task {
            let d = UserDefaults.standard
            if let id = d.string(forKey: "abrir") { nav.ficha = progreso.catalogo.titulo(id) }
            if let s = d.string(forKey: "importar"), let url = URL(string: s) { importa(url) }
        }
        #endif
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

    private var conseguidos: Set<String> { Set(progreso.logros().filter(\.conseguido).map(\.id)) }

    private func importa(_ url: URL) {
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

    static func crea(v: String, e: String) -> URL? {
        var c = URLComponents()
        c.scheme = "maraton"
        c.host = "importar"
        c.queryItems = [URLQueryItem(name: "v", value: v), URLQueryItem(name: "e", value: e)]
        return c.url
    }
}

enum Avisos {
    /// «Progreso importado: N títulos y N episodios nuevos» (y las notas, si llegaron)
    @MainActor static func importado(_ r: Progreso.Importado, _ ajustes: Ajustes) -> String {
        let notas = r.notas > 0 ? ajustes.tr(" y \(r.notas) notas", ", \(r.notas) ratings") : ""
        return ajustes.tr("Progreso importado: \(r.titulos) títulos, \(r.episodios) episodios nuevos\(notas).",
                          "Progress imported: \(r.titulos) titles, \(r.episodios) new episodes\(notas).")
    }
}
