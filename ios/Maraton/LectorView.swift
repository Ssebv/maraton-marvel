import ImageIO
import PDFKit
import SwiftUI
import MaratonKit

/// El lector a pantalla completa, como el de la web: una página, deslizar o
/// tocar los lados para pasar, tocar el centro esconde los controles, y
/// recuerda por dónde vas. Lo del iPhone: pellizcar para ampliar.
struct LectorView: View {
    let titulo: Titulo
    @Environment(\.catalogo) private var catalogo
    @Environment(Biblioteca.self) private var biblioteca
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(\.dismiss) private var cerrar
    @State private var hojas: Hojas?
    @State private var error: String?
    @State private var pag = 0
    @State private var controles = true
    /// En el iPhone, al ancho (entera sale diminuta con bandas); se recuerda
    @AppStorage("lectorAlAncho") private var alAncho = true
    @AppStorage("lectorPistaVista") private var pistaVista = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let error {
                Text(error).foregroundStyle(.white).multilineTextAlignment(.center).padding(32)
            } else if let hojas {
                TabView(selection: $pag) {
                    ForEach(0..<hojas.total, id: \.self) { i in
                        PaginaComic(hojas: hojas, indice: i, alAncho: alAncho, toque: toque)
                            .accessibilityLabel(ajustes.tr("Página \(i + 1) de \(hojas.total)", "Page \(i + 1) of \(hojas.total)"))
                            .tag(i)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .ignoresSafeArea()
            } else {
                ProgressView(ajustes.tr("Abriendo \(nombre)…", "Opening \(nombre)…")).tint(.white).foregroundStyle(.white)
            }
        }
        .overlay(alignment: .top) { barraArriba }
        .overlay(alignment: .bottom) { if let hojas, controles { barraAbajo(hojas) } }
        .animation(.easeOut(duration: 0.2), value: controles)
        .statusBarHidden(!controles)
        .persistentSystemOverlays(controles ? .automatic : .hidden)
        .preferredColorScheme(.dark)
        .task { await abre() }
        .onChange(of: pag) { _, p in
            // releer uno ya leído no deja una «página por la que vas»
            if let hojas, !progreso.visto(titulo.id) { progreso.ponPagina(p, de: hojas.total, a: titulo.id) }
            if p > 0 { pistaVista = true }
        }
    }

    private var nombre: String { catalogo?.nombre(titulo, en: ajustes.idioma) ?? titulo.t }

    private func abre() async {
        do {
            let fuente = try biblioteca.fuente(titulo.id)
            let h = try await Task.detached { try Hojas(fuente) }.value
            if let l = progreso.lecturas[titulo.id], l.p < h.total { pag = l.p }
            hojas = h
        } catch {
            self.error = Lectura.texto(de: error, ajustes)
        }
    }

    private func toque(_ x: CGFloat) {
        guard let hojas else { return }
        if x < 0.35 { withAnimation(.snappy) { pag = max(0, pag - 1) } }
        else if x > 0.65 { withAnimation(.snappy) { pag = min(hojas.total - 1, pag + 1) } }
        else { controles.toggle(); pistaVista = true }
    }

    // El ✕ se queda aunque escondas los controles, como en la web
    private var barraArriba: some View {
        HStack(spacing: 12) {
            Button { cerrar() } label: {
                Image(systemName: "xmark").font(.body.weight(.semibold)).frame(width: 44, height: 44)
            }
            .accessibilityLabel(ajustes.tr("Cerrar el lector", "Close the reader"))
            .background(.ultraThinMaterial, in: .circle)
            if controles {
                Text(nombre).font(.subheadline.weight(.semibold)).lineLimit(1)
                Spacer(minLength: 0)
                if hojas != nil {
                    Button { alAncho.toggle() } label: {
                        Label(alAncho ? ajustes.tr("Ver entera", "Fit page") : ajustes.tr("Al ancho", "Fit width"),
                              systemImage: alAncho ? "rectangle.portrait" : "arrow.left.and.right")
                            .font(.footnote.weight(.semibold))
                            .padding(.horizontal, 12).frame(minHeight: 44)
                    }
                    .background(.ultraThinMaterial, in: .capsule)
                }
            } else {
                Spacer()
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
    }

    private func barraAbajo(_ hojas: Hojas) -> some View {
        let ultima = pag == hojas.total - 1
        return VStack(spacing: 12) {
            if !pistaVista {
                Text(ajustes.tr("Toca los lados o desliza para pasar página · toca el centro para esconder los controles · pellizca para ampliar",
                                "Tap the sides or swipe to turn the page · tap the middle to hide the controls · pinch to zoom"))
                    .font(.footnote).multilineTextAlignment(.center)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: .rect(cornerRadius: Tema.radioM))
            }
            if ultima && !progreso.visto(titulo.id) {
                Button {
                    progreso.alternar(titulo.id)
                    cerrar()
                } label: {
                    Text(ajustes.tr("Marcar como leído", "Mark as read")).font(.body.weight(.semibold)).frame(minHeight: 44).padding(.horizontal, 12)
                }
                .buttonStyle(.borderedProminent).buttonBorderShape(.capsule).tint(Tema.verde)
                .sensoryFeedback(.success, trigger: progreso.visto(titulo.id)) { _, nuevo in nuevo }
            }
            HStack(spacing: 4) {
                flecha("chevron.left", ajustes.tr("Página anterior", "Previous page"), activa: pag > 0) { pag -= 1 }
                Text("**\(pag + 1)** / \(hojas.total)").monospacedDigit().frame(minWidth: 80)
                flecha("chevron.right", ajustes.tr("Página siguiente", "Next page"), activa: !ultima) { pag += 1 }
            }
            .padding(.horizontal, 6)
            .background(.ultraThinMaterial, in: .capsule)
            Barra(fraccion: Double(pag + 1) / Double(hojas.total), color: Tema.rojo)
                .frame(height: 3).accessibilityHidden(true)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16).padding(.bottom, 8)
        .transition(.opacity)
    }

    private func flecha(_ icono: String, _ etiqueta: String, activa: Bool, _ accion: @escaping () -> Void) -> some View {
        Button { withAnimation(.snappy) { accion() } } label: {
            Image(systemName: icono).font(.body.weight(.semibold)).frame(width: 44, height: 44)
        }
        .disabled(!activa).opacity(activa ? 1 : 0.35)
        .accessibilityLabel(etiqueta)
    }
}

extension Lectura {
    /// Los errores del lector dichos para una persona
    @MainActor static func texto(de error: Error, _ ajustes: Ajustes) -> String {
        switch error as? ErrorLector {
        case .rar?: ajustes.tr("Este CBR es un RAR y en el iPhone aún no se abre: pásalo a CBZ (o elige las páginas como imágenes).",
                               "This CBR is a RAR archive and can't be opened on iPhone yet: convert it to CBZ (or pick the pages as images).")
        case .noEsZip?: ajustes.tr("El archivo está dañado o no es un CBZ/ZIP válido.", "The file is damaged or not a valid CBZ/ZIP.")
        case .zip64?: ajustes.tr("El CBZ es demasiado grande (más de 4 GB).", "The CBZ is too large (over 4 GB).")
        case .sinPaginas?: ajustes.tr("No trae páginas: no hay imágenes dentro.", "No pages: there are no images inside.")
        case .cifrado?: ajustes.tr("El CBZ está cifrado con contraseña.", "The CBZ is password-protected.")
        case let .danado(p)?: ajustes.tr("No se pudo leer la página \(p + 1): el archivo está dañado.", "Couldn't read page \(p + 1): the file is damaged.")
        case .formato?: ajustes.tr("Formato no reconocido: vale un CBZ/ZIP, un PDF o imágenes.", "Unrecognised format: a CBZ/ZIP, a PDF or images work.")
        case .vacio?: ajustes.tr("El archivo ya no está en este iPhone: elígelo otra vez.", "The file is no longer on this iPhone: pick it again.")
        case nil: ajustes.tr("No se pudo abrir: \(error.localizedDescription)", "Couldn't open it: \(error.localizedDescription)")
        }
    }
}

/// Las páginas, decodificadas fuera del hilo principal y a lo sumo a 3000 px
/// (una página de cómic sin tope pesa 25 MB en memoria); se guardan unas pocas
final class Hojas: @unchecked Sendable {
    let total: Int
    private let fuente: Lector.Fuente
    private let pdf: PDFDocument?
    private let cerrojo = NSLock()
    private let cache = NSCache<NSNumber, UIImage>()
    static let ladoMaximo: CGFloat = 3000

    init(_ fuente: Lector.Fuente) throws {
        self.fuente = fuente
        switch fuente {
        case let .zip(z): total = z.total; pdf = nil
        case let .imagenes(u): total = u.count; pdf = nil
        case let .pdf(url):
            guard let d = PDFDocument(url: url), d.pageCount > 0 else { throw ErrorLector.formato }
            if d.isLocked { throw ErrorLector.cifrado }
            pdf = d; total = d.pageCount
        }
        cache.countLimit = 5
    }

    func imagen(_ i: Int) async -> UIImage? {
        if let c = cache.object(forKey: i as NSNumber) { return c }
        let img = await Task.detached(priority: .userInitiated) { [self] in self.decodifica(i) }.value
        if let img { cache.setObject(img, forKey: i as NSNumber) }
        return img
    }

    private func decodifica(_ i: Int) -> UIImage? {
        switch fuente {
        case let .zip(z): return (try? z.pagina(i)).flatMap(Self.reducida)
        case let .imagenes(u): return (try? Data(contentsOf: u[i])).flatMap(Self.reducida)
        case .pdf:
            // PDFKit no se lleva bien con dos hilos a la vez sobre un documento
            cerrojo.lock(); defer { cerrojo.unlock() }
            guard let p = pdf?.page(at: i) else { return nil }
            let caja = p.bounds(for: .mediaBox).size
            let escala = min(Self.ladoMaximo / max(caja.width, caja.height), 4)
            return p.thumbnail(of: CGSize(width: caja.width * escala, height: caja.height * escala), for: .mediaBox)
        }
    }

    static func reducida(_ datos: Data) -> UIImage? {
        guard let src = CGImageSourceCreateWithData(datos as CFData, nil) else { return nil }
        let op: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                   kCGImageSourceCreateThumbnailWithTransform: true,
                                   kCGImageSourceShouldCacheImmediately: true,
                                   kCGImageSourceThumbnailMaxPixelSize: ladoMaximo]
        return CGImageSourceCreateThumbnailAtIndex(src, 0, op as CFDictionary).map(UIImage.init(cgImage:))
    }
}

/// Una página: se carga al aparecer y se amplía con dos dedos
private struct PaginaComic: View {
    let hojas: Hojas
    let indice: Int
    let alAncho: Bool
    let toque: (CGFloat) -> Void
    @State private var imagen: UIImage?

    var body: some View {
        ZStack {
            if let imagen {
                Ampliable(imagen: imagen, alAncho: alAncho, toque: toque)
            } else {
                GeometryReader { g in
                    ProgressView().tint(.white)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .contentShape(.rect)
                        .onTapGesture { p in toque(p.x / max(g.size.width, 1)) }
                }
            }
        }
        .task(id: indice) { imagen = await hojas.imagen(indice) }
    }
}

/// UIScrollView con la imagen dentro: zoom con pellizco, centrada cuando cabe
/// y, al ancho, se baja por la página con el dedo
private struct Ampliable: UIViewRepresentable {
    let imagen: UIImage
    let alAncho: Bool
    let toque: (CGFloat) -> Void

    func makeUIView(context: Context) -> Vista {
        let v = Vista()
        v.toque = toque
        return v
    }

    func updateUIView(_ v: Vista, context: Context) {
        v.toque = toque
        v.pon(imagen, alAncho: alAncho)
    }

    final class Vista: UIScrollView, UIScrollViewDelegate {
        let imagenView = UIImageView()
        var toque: ((CGFloat) -> Void)?
        private var alAncho = true
        private var ajustado: (CGSize, CGSize, Bool)?

        override init(frame: CGRect) {
            super.init(frame: frame)
            delegate = self
            showsVerticalScrollIndicator = false
            showsHorizontalScrollIndicator = false
            contentInsetAdjustmentBehavior = .never
            decelerationRate = .fast
            addSubview(imagenView)
            addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tocado)))
        }
        required init?(coder: NSCoder) { fatalError() }

        func pon(_ img: UIImage, alAncho: Bool) {
            if imagenView.image !== img { imagenView.image = img; imagenView.frame = CGRect(origin: .zero, size: img.size); ajustado = nil }
            if self.alAncho != alAncho { self.alAncho = alAncho; ajustado = nil }
            setNeedsLayout()
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            guard let img = imagenView.image, img.size.width > 0, bounds.width > 0 else { return }
            // la escala se rehace solo si cambia la página, el tamaño o el ajuste
            if ajustado.map({ $0.0 != bounds.size || $0.1 != img.size || $0.2 != alAncho }) ?? true {
                ajustado = (bounds.size, img.size, alAncho)
                let entera = min(bounds.width / img.size.width, bounds.height / img.size.height)
                let minima = alAncho ? bounds.width / img.size.width : entera
                minimumZoomScale = minima
                maximumZoomScale = max(minima * 4, 1)
                zoomScale = minima
                centra()
                // arriba del todo (al ancho, la página empieza por su viñeta de arriba)
                contentOffset = CGPoint(x: -contentInset.left, y: -contentInset.top)
            }
            centra()
        }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? { imagenView }
        func scrollViewDidZoom(_ scrollView: UIScrollView) { centra() }

        private func centra() {
            let dx = max(0, (bounds.width - contentSize.width) / 2)
            let dy = max(0, (bounds.height - contentSize.height) / 2)
            contentInset = UIEdgeInsets(top: dy, left: dx, bottom: dy, right: dx)
        }

        @objc private func tocado(_ g: UITapGestureRecognizer) {
            let x = g.location(in: self).x - contentOffset.x
            toque?(x / max(bounds.width, 1))
        }
    }
}
