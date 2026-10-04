// La barra de pestañas como la de Norte: la de iOS, que se recoge al bajar,
// con un accesorio encima que hace de mini reproductor del maratón (el
// siguiente título, como la canción en Música) y una entrada suave por pestaña.
import SwiftUI
import MaratonKit

/// El siguiente título encima de la barra: tocarlo abre su ficha y el ✓ lo marca.
/// Al recogerse la barra va en línea, junto a la pestaña, y dice menos.
struct AccesorioSiguiente: View {
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav
    @Environment(\.tabViewBottomAccessoryPlacement) private var lugar

    /// Solo sube al tocar el ✓: la háptica no suena al marcar en otra parte
    @State private var marcadas = 0

    private var compacto: Bool { lugar == .inline }

    var body: some View {
        HStack(spacing: 10) {
            let catalogo = progreso.catalogo
            if let t = progreso.siguiente() {
                Button { nav.ficha = t } label: {
                    HStack(spacing: 10) {
                        Poster(url: catalogo.urlPoster(t.id, idioma: ajustes.idioma), ancho: compacto ? 18 : 24, radio: 4)
                        VStack(alignment: .leading, spacing: 0) {
                            if !compacto {
                                Text(rotulo(t, catalogo)).font(.caption2.weight(.semibold)).foregroundStyle(Tema.color(saga: catalogo.saga(de: t.id)))
                            }
                            Text(catalogo.nombre(t, en: ajustes.idioma)).font(.subheadline.weight(.semibold))
                        }
                        .lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .contentShape(.rect)
                }
                .accessibilityLabel(ajustes.tr("Siguiente: \(catalogo.nombre(t, en: ajustes.idioma))", "Next: \(catalogo.nombre(t, en: ajustes.idioma))"))
                .accessibilityHint(ajustes.tr("Abre su ficha", "Opens its page"))
                // las series se marcan por episodios: el botón abre la ficha
                if !t.esSerie {
                    Button {
                        withAnimation(.snappy) { progreso.alternar(t.id) }
                        marcadas += 1
                    } label: {
                        Image(systemName: "checkmark")
                            .font(.system(size: compacto ? 13 : 15, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: compacto ? 28 : 34, height: compacto ? 28 : 34)
                            .background(Tema.verde, in: .circle)
                            .contentShape(.circle)
                    }
                    .sensoryFeedback(.success, trigger: marcadas)
                    .accessibilityLabel(ajustes.tr("Marcar como vista", "Mark as watched"))
                }
            } else {
                Label(ajustes.tr("Maratón completo", "Marathon complete"), systemImage: "trophy.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Tema.oro)
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, compacto ? 10 : 14)
        .buttonStyle(.plain)
        .foregroundStyle(Tema.tinta)
    }

    /// «Siguiente · X-Men 3/17»
    private func rotulo(_ t: Titulo, _ c: Catalogo) -> String {
        let saga = c.saga(de: t.id) == "xmen" ? "X-Men" : ajustes.tr("UCM", "MCU")
        let pos = c.posicionEnSaga(t.id).map { " \($0.posicion)/\($0.total)" } ?? ""
        if t.esSerie, case let (v, n) = progreso.vistosDe(serie: t.id), v > 0 {
            return ajustes.tr("Sigue · \(v) de \(n) episodios", "Continue · \(v) of \(n) episodes")
        }
        return ajustes.tr("Siguiente · \(saga)\(pos)", "Up next · \(saga)\(pos)")
    }
}

/// La entrada de una pestaña, como en Norte: aparece casi opaca y sin moverse
private struct EntradaPestana: ViewModifier {
    let pestana: Navegacion.Pestana
    @Environment(Navegacion.self) private var nav
    @State private var visible = false

    func body(content: Content) -> some View {
        content
            .opacity(visible ? 1 : 0.55)
            .onChange(of: nav.pestana, initial: true) {
                if nav.pestana == pestana {
                    withAnimation(.easeOut(duration: 0.16)) { visible = true }
                } else {
                    visible = false
                }
            }
    }
}

extension View {
    func entradaPestana(_ p: Navegacion.Pestana) -> some View { modifier(EntradaPestana(pestana: p)) }
}
