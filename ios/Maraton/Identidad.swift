// Lo que hace que se reconozca la web: el titular en Archivo Black, los
// rótulos en versalitas, la barra roja→oro, los fotogramas de fondo con velo
// y el sello «VISTA» sobre el póster.
import SwiftUI
import MaratonKit

extension Tema {
    static let verde = dinamico(claro: 0x2F8F5B, oscuro: 0x5CBF7F)
    static let oroVivo = Color(uiColor: UIColor(hex: 0xE8A93C))

    /// El titular de la web (h1): Archivo Black en mayúsculas
    static func marca(_ tamano: CGFloat) -> Font { .custom("ArchivoBlack-Regular", size: tamano, relativeTo: .largeTitle) }
}

/// «MARATÓN MARVEL & X-MEN» con MARVEL en rojo, como el h1 de la web
struct Marca: View {
    var tamano: CGFloat = 30
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        Text("\(ajustes.tr("MARATÓN", "MARATHON")) \(Text("MARVEL").foregroundStyle(Tema.rojo)) & X-MEN")
            .font(Tema.marca(tamano))
            .tracking(-0.3)
            .lineLimit(2)
            .minimumScaleFactor(0.7)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Rótulo pequeño en mayúsculas con espaciado («SIGUIENTE EN X-MEN · 11/17»)
struct Rotulo: View {
    let texto: String
    var color: Color = Tema.tinta2
    var punto: Color? = nil

    var body: some View {
        HStack(spacing: 6) {
            if let punto { Circle().fill(punto).frame(width: 9, height: 9) }
            Text(texto.uppercased())
                .font(.caption.weight(.bold))
                .tracking(1.4)
                .foregroundStyle(color)
        }
    }
}

/// La barra del maratón: de rojo a oro
struct BarraMarca: View {
    let fraccion: Double
    var alto: CGFloat = 7

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.14))
                Capsule()
                    .fill(LinearGradient(colors: [Tema.rojo, Tema.oroVivo], startPoint: .leading, endPoint: .trailing))
                    .frame(width: fraccion <= 0 ? 0 : max(alto, g.size.width * min(1, fraccion)))
            }
        }
        .frame(height: alto)
        .animation(.spring(duration: 0.5), value: fraccion)
    }
}

/// Fotograma de TMDB (red, con caché de URLSession) o, si no hay, un fondo
/// del paquete. Sin nada, un degradado del color de la saga.
struct Fotograma: View {
    let remota: URL?
    var local: URL? = nil
    var color: Color = Tema.rojo

    var body: some View {
        // El tamaño lo pone quien lo usa (Color.clear); la imagen llena y se recorta
        Color.clear
            .overlay {
                LinearGradient(colors: [color.opacity(0.55), .black], startPoint: .topLeading, endPoint: .bottomTrailing)
            }
            .overlay {
                if local != nil { ImagenLocal(url: local) { Color.clear } }
            }
            .overlay {
                if let remota {
                    AsyncImage(url: remota, transaction: Transaction(animation: .easeOut(duration: 0.35))) { fase in
                        if let imagen = fase.image { imagen.resizable().scaledToFill().transition(.opacity) }
                    }
                }
            }
            .clipped()
            .accessibilityHidden(true)
    }
}

/// Velo para leer texto blanco sobre un fotograma (abajo más oscuro)
struct Velo: View {
    var hacia: Color = .black
    var body: some View {
        LinearGradient(stops: [.init(color: hacia.opacity(0.35), location: 0),
                               .init(color: hacia.opacity(0.55), location: 0.5),
                               .init(color: hacia.opacity(0.92), location: 1)],
                       startPoint: .top, endPoint: .bottom)
    }
}

/// Cabecera de cada pestaña: fotograma con velo, titular y lo que se quiera debajo
struct CabeceraPestana<Contenido: View>: View {
    let titulo: String
    var fotograma: URL? = nil
    var fondo: URL? = nil
    var color: Color = Tema.rojo
    @ViewBuilder var contenido: Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(titulo.uppercased())
                .font(Tema.marca(30))
                .tracking(-0.3)
                .accessibilityAddTraits(.isHeader)
            contenido
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 64)
        .padding(.bottom, 20)
        .background {
            ZStack {
                Fotograma(remota: fotograma, local: fondo, color: color)
                Velo()
            }
        }
        .environment(\.colorScheme, .dark)
    }
}

/// El sello «VISTA» de la web, inclinado sobre el póster
struct SelloVista: View {
    @Environment(Ajustes.self) private var ajustes
    var body: some View {
        Text(ajustes.tr("VISTA", "SEEN"))
            .font(Tema.marca(15))
            .tracking(2)
            .foregroundStyle(Tema.verde)
            .padding(.horizontal, 10).padding(.vertical, 3)
            .background(.black.opacity(0.35), in: .rect(cornerRadius: Tema.radioS))
            .overlay(RoundedRectangle(cornerRadius: Tema.radioS).strokeBorder(Tema.verde, lineWidth: 2.5))
            .rotationEffect(.degrees(-12))
            .accessibilityLabel(ajustes.tr("Vista", "Seen"))
    }
}

/// Campo de búsqueda en píldora, como el de la barra de la web
struct CampoBuscar: View {
    @Binding var texto: String
    let placeholder: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.white.opacity(0.7))
            TextField(placeholder, text: $texto)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !texto.isEmpty {
                Button { texto = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.white.opacity(0.7)) }
                    .accessibilityLabel("Borrar")
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 46)
        .background(.white.opacity(0.12), in: .capsule)
        .overlay(Capsule().strokeBorder(.white.opacity(0.18), lineWidth: 1))
    }
}
