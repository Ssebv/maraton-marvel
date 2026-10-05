// Noticias de Marvel en Inicio, como la barra lateral de la web: titular, medio
// y hace cuánto; tocar abre la noticia en su medio sin salir de la app.
import SwiftUI
import SafariServices
import MaratonKit

/// Las noticias: primero las guardadas (al instante y sin conexión), luego las de la web
@MainActor @Observable
final class Noticiero {
    private(set) var es: [Noticia] = []
    private(set) var en: [Noticia] = []
    /// Cuándo llegaron bien por última vez (un fallo no hace esperar la hora)
    private var pedidas: Date?
    private var pidiendo = false
    private var leidas = false
    private let guardadas = URL.cachesDirectory.appending(path: "noticias.json")

    func de(_ idioma: Idioma) -> [Noticia] { idioma == .en ? en : es }

    /// La tarea diaria las cambia una vez al día: no se piden más de una vez por hora
    /// (salvo al tirar para actualizar)
    func actualiza(forzando: Bool = false) async {
        // las guardadas, una sola vez (no en cada init: SwiftUI rehace el @State inicial)
        if !leidas {
            leidas = true
            if let d = try? Data(contentsOf: guardadas), let n = Noticias.lee(d) { (es, en) = n }
        }
        if pidiendo || (!forzando && pedidas.map { Date.now.timeIntervalSince($0) < 3600 } == true) { return }
        pidiendo = true
        defer { pidiendo = false }
        var pedido = URLRequest(url: Noticias.fichero, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        pedido.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (d, r) = try? await URLSession.shared.data(for: pedido),
              (r as? HTTPURLResponse)?.statusCode == 200, let n = Noticias.lee(d) else { return }
        (es, en) = n
        pedidas = .now
        try? d.write(to: guardadas, options: .atomic)
    }
}

/// «Noticias» en Inicio: un carrusel de tarjetas con su imagen
struct NoticiasInicio: View {
    let noticiero: Noticiero
    @Environment(Ajustes.self) private var ajustes
    @State private var abierta: Noticia?

    var body: some View {
        let lista = noticiero.de(ajustes.idioma)
        if !lista.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(ajustes.tr("Noticias", "News")).font(.title3.weight(.bold))
                    .padding(.horizontal, 16)
                ScrollView(.horizontal) {
                    LazyHStack(alignment: .top, spacing: 12) {
                        ForEach(lista) { n in
                            Button { abierta = n } label: { TarjetaNoticia(noticia: n) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollIndicators(.hidden)
            }
            .fullScreenCover(item: $abierta) { n in Navegador(url: n.url).ignoresSafeArea() }
        }
    }
}

private struct TarjetaNoticia: View {
    let noticia: Noticia
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Tema.panel2
                .frame(width: 260, height: 146)
                .overlay {
                    ImagenCacheada(url: Noticias.urlImagen(noticia)) {
                        Image(systemName: "newspaper").font(.title).foregroundStyle(Tema.tinta3)
                    }
                }
                .clipped()
            VStack(alignment: .leading, spacing: 6) {
                Text(noticia.titular)
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Tema.tinta)
                    .lineLimit(3, reservesSpace: true)
                    .multilineTextAlignment(.leading)
                Text(pie).font(.caption).foregroundStyle(Tema.tinta2).lineLimit(1)
            }
            .padding(12)
        }
        .frame(width: 260)
        .superficie(radio: Tema.radioL)
        .clipShape(.rect(cornerRadius: Tema.radioL))
        .accessibilityElement(children: .combine)
        .accessibilityHint(ajustes.tr("Abre la noticia en su medio", "Opens the story on its site"))
    }

    /// «Espinof · hace 3 h»
    private var pie: String {
        let cuando = noticia.fecha.map { f -> String in
            let r = RelativeDateTimeFormatter()
            r.locale = ajustes.locale
            r.unitsStyle = .abbreviated
            return r.localizedString(for: min(f, .now), relativeTo: .now)
        }
        return [noticia.medio, cuando].compactMap { $0 }.joined(separator: " · ")
    }
}

/// Safari dentro de la app (con su botón para cerrar y lector)
private struct Navegador: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let c = SFSafariViewController(url: url)
        c.preferredControlTintColor = UIColor(Tema.rojo)
        c.dismissButtonStyle = .close
        return c
    }
    func updateUIViewController(_ c: SFSafariViewController, context: Context) {}
}
