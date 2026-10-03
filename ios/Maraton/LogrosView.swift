import SwiftUI
import MaratonKit

/// Los logros de la web en Progreso: por grupos, en oro los conseguidos y con
/// su avance los que se pueden contar.
struct SeccionLogros: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        let logros = progreso.logros()
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(ajustes.tr("Logros", "Achievements")).font(.title3.weight(.bold))
                Spacer()
                Text(ajustes.tr("\(logros.filter(\.conseguido).count) de \(logros.count)",
                                "\(logros.filter(\.conseguido).count) of \(logros.count)"))
                    .font(.footnote.monospacedDigit()).foregroundStyle(Tema.tinta2)
            }
            ForEach(GrupoLogro.todos, id: \.id) { g in
                let del = logros.filter { $0.grupo == g.id }
                if !del.isEmpty {
                    HStack {
                        Rotulo(texto: ajustes.tr(g.es, g.en))
                        Spacer()
                        Text("\(del.filter(\.conseguido).count)/\(del.count)")
                            .font(.caption.weight(.semibold).monospacedDigit()).foregroundStyle(Tema.tinta2)
                    }
                    .padding(.top, 4)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(del) { l in Insignia(logro: l) }
                    }
                }
            }
        }
    }
}

private struct Insignia: View {
    let logro: Logro
    @Environment(\.catalogo) private var catalogo
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        let ok = logro.conseguido
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: logro.simbolo)
                .font(.title3)
                .foregroundStyle(ok ? Tema.oro : Tema.tinta3)
                .frame(width: 40, height: 40)
                .background(Circle().fill(ok ? Tema.oro.opacity(0.16) : Tema.panel2))
                .overlay(Circle().strokeBorder(ok ? Tema.oro.opacity(0.6) : .clear, lineWidth: 1.5))
            Text(catalogo?.texto(logro.titulo, en: ajustes.idioma) ?? logro.titulo)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(ok ? Tema.tinta : Tema.tinta2)
            Text(catalogo?.texto(logro.descripcion, en: ajustes.idioma) ?? logro.descripcion)
                .font(.caption)
                .foregroundStyle(Tema.tinta2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            // bloqueado con algo hecho: cuánto falta
            if !ok, let a = logro.avance, a.hecho > 0 {
                HStack(spacing: 6) {
                    Barra(fraccion: Double(a.hecho) / Double(a.meta), color: Tema.oro)
                    Text("\(a.hecho)/\(a.meta)").font(.caption2.monospacedDigit()).foregroundStyle(Tema.tinta2)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .superficie(radio: Tema.radioL)
        .overlay(RoundedRectangle(cornerRadius: Tema.radioL).strokeBorder(ok ? Tema.oro.opacity(0.45) : .clear, lineWidth: 1))
        .opacity(ok ? 1 : 0.85)
        .accessibilityElement(children: .combine)
        .accessibilityValue(ok ? ajustes.tr("Conseguido", "Unlocked") : ajustes.tr("Bloqueado", "Locked"))
    }
}

/// El aviso «Logro desbloqueado» arriba, como en la web; se va solo
struct AvisoLogro: View {
    let logro: Logro
    /// Otros que se desbloquearon a la vez (al importar el progreso)
    var mas = 0
    @Environment(\.catalogo) private var catalogo
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: logro.simbolo)
                .font(.title3)
                .foregroundStyle(Tema.oroVivo)
                .frame(width: 40, height: 40)
                .background(Circle().fill(Tema.oroVivo.opacity(0.18)))
            VStack(alignment: .leading, spacing: 2) {
                Rotulo(texto: ajustes.tr("Logro desbloqueado", "Achievement unlocked"), color: Tema.oroVivo)
                Text(catalogo?.texto(logro.titulo, en: ajustes.idioma) ?? logro.titulo)
                    .font(.headline).foregroundStyle(.white)
                + Text(mas > 0 ? ajustes.tr("  +\(mas) más", "  +\(mas) more") : "")
                    .font(.subheadline).foregroundStyle(.white.opacity(0.7))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(.black.opacity(0.82), in: .capsule)
        .overlay(Capsule().strokeBorder(Tema.oroVivo.opacity(0.6), lineWidth: 1))
        .shadow(color: Tema.oroVivo.opacity(0.35), radius: 14, y: 6)
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
    }
}

/// Pone el aviso encima de la vista; tocarlo lleva a los logros
struct CapaAvisoLogro: ViewModifier {
    var visible = true
    @Environment(Navegacion.self) private var nav

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if visible, let l = nav.logroNuevo {
                    AvisoLogro(logro: l, mas: nav.logrosMas)
                        .onTapGesture {
                            nav.logroNuevo = nil
                            nav.ficha = nil
                            nav.pestana = .progreso
                        }
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(.spring(duration: 0.45), value: nav.logroNuevo)
    }
}
