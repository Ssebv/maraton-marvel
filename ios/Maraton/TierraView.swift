import SwiftUI
import MaratonKit

/// La página de una Tierra, como en la web: el planeta grande, su número,
/// nombre y estado, de qué va, lo que trae rumbo a Doomsday, cuánto llevas y
/// el siguiente, con qué Tierras se cruza, cómo se conecta título a título y
/// todos sus títulos para marcarlos.
struct TierraView: View {
    let num: String
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav
    @State private var soloPendientes = false

    var body: some View {
        ScrollView {
            if let catalogo, let u = catalogo.universo(num) {
                let color = Color(hex: u.c) ?? Tema.rojo
                VStack(alignment: .leading, spacing: 0) {
                    cabecera(u, color: color, catalogo)
                    VStack(alignment: .leading, spacing: 22) {
                        progresoYSiguiente(u, color: color, catalogo)
                        if let doom = catalogo.texto(u.doom, en: ajustes.idioma) {
                            VStack(alignment: .leading, spacing: 6) {
                                Rotulo(texto: ajustes.tr("Rumbo a Doomsday", "Toward Doomsday"), color: Tema.oro)
                                Text(doom).font(.subheadline)
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Tema.oro.opacity(0.1), in: .rect(cornerRadius: Tema.radioL))
                            .overlay(RoundedRectangle(cornerRadius: Tema.radioL).strokeBorder(Tema.oro.opacity(0.45), lineWidth: 1))
                        }
                        cruces(u, catalogo)
                        conexiones(u, catalogo)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 18)
                    titulos(u, color: color, catalogo)
                }
            } else {
                ContentUnavailableView(ajustes.tr("Esta Tierra ya no existe", "This Earth no longer exists"), systemImage: "globe")
            }
        }
        .background(Tema.fondo)
        .ignoresSafeArea(edges: .top)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: num) { soloPendientes = false }
    }

    private func cabecera(_ u: Universo, color: Color, _ catalogo: Catalogo) -> some View {
        let primero = catalogo.titulos(de: u).first?.id
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 16) {
                Orbe(color: color, rasgo: u.rasgo, diametro: 72, progreso: progreso.progreso(de: u).fraccion)
                    .frame(width: 100, height: 100)
                VStack(alignment: .leading, spacing: 4) {
                    Text(catalogo.numero(u.num, en: ajustes.idioma).uppercased())
                        .font(Tema.marca(15))
                        .tracking(0.5)
                        .foregroundStyle(color.mix(with: .white, by: 0.35))
                    Text(catalogo.texto(u.nombre, en: ajustes.idioma) ?? u.nombre)
                        .font(.title2.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    if let e = catalogo.texto(u.estado, en: ajustes.idioma) {
                        Text(e).font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.75))
                    }
                }
            }
            if let desc = catalogo.texto(u.desc, en: ajustes.idioma) {
                Text(desc)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.88))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 100)
        .padding(.bottom, 22)
        .background {
            ZStack {
                Fotograma(remota: primero.flatMap { catalogo.urlFotograma($0) }, color: color)
                Velo()
                LinearGradient(colors: [color.opacity(0.35), .clear], startPoint: .bottomLeading, endPoint: .topTrailing)
            }
        }
        .environment(\.colorScheme, .dark)
    }

    private func progresoYSiguiente(_ u: Universo, color: Color, _ catalogo: Catalogo) -> some View {
        let pr = progreso.progreso(de: u)
        return VStack(alignment: .leading, spacing: 10) {
            Barra(fraccion: pr.fraccion, color: color)
            Text("\(pr.vistos) / \(pr.total) \(ajustes.tr("completados en este universo", "completed in this universe"))")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Tema.tinta2)
                .contentTransition(.numericText())
            if let sig = progreso.siguiente(en: u) {
                Button { nav.ficha = sig } label: {
                    HStack(spacing: 12) {
                        Poster(url: catalogo.urlPoster(sig.id, idioma: ajustes.idioma), ancho: 40, radio: Tema.radioS + 2)
                        VStack(alignment: .leading, spacing: 2) {
                            Rotulo(texto: ajustes.tr("Siguiente", "Next"), color: color)
                            Text(catalogo.nombre(sig, en: ajustes.idioma)).font(.body.weight(.semibold))
                                .multilineTextAlignment(.leading)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Tema.tinta3)
                    }
                    .padding(12)
                    .superficie(radio: Tema.radioL)
                }
                .buttonStyle(.plain)
            } else {
                Label(ajustes.tr("Completaste esta Tierra", "You completed this Earth"), systemImage: "checkmark.seal.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Tema.verde)
            }
        }
    }

    @ViewBuilder
    private func cruces(_ u: Universo, _ catalogo: Catalogo) -> some View {
        let lista = catalogo.cruces(de: u)
        if !lista.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Rotulo(texto: ajustes.tr("Se cruza con", "Crosses paths with"))
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(lista, id: \.universo.num) { c in
                            let col = Color(hex: c.universo.c) ?? Tema.rojo
                            NavigationLink(value: c.universo.num) {
                                HStack(spacing: 6) {
                                    Circle().fill(col).frame(width: 9, height: 9)
                                    Text(catalogo.numeroCorto(c.universo.num, en: ajustes.idioma)).font(.subheadline.weight(.semibold))
                                    Text("\(c.comunes)").font(.caption.weight(.bold)).foregroundStyle(Tema.tinta2)
                                }
                                .padding(.horizontal, 14)
                                .frame(minHeight: 40)
                                .background(Tema.panel, in: .capsule)
                                .overlay(Capsule().strokeBorder(col.opacity(0.5), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(catalogo.numero(c.universo.num, en: ajustes.idioma)): \(catalogo.texto(c.universo.nombre, en: ajustes.idioma) ?? c.universo.nombre). \(c.comunes) \(c.comunes == 1 ? ajustes.tr("título en común", "shared title") : ajustes.tr("títulos en común", "shared titles"))")
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    @ViewBuilder
    private func conexiones(_ u: Universo, _ catalogo: Catalogo) -> some View {
        let lista = catalogo.conexiones(de: u)
        if !lista.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Rotulo(texto: ajustes.tr("Cómo se conecta", "How it connects"))
                VStack(spacing: 0) {
                    ForEach(lista, id: \.arista) { c in
                        if c.arista != lista.first?.arista { Divider().padding(.leading, 14) }
                        Button { nav.ficha = c.otro } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(catalogo.nombre(c.aqui, en: ajustes.idioma)) ↔ \(catalogo.nombre(c.otro, en: ajustes.idioma))")
                                    .font(.subheadline.weight(.semibold))
                                Text(catalogo.texto(c.arista.t, en: ajustes.idioma) ?? c.arista.t)
                                    .font(.footnote).foregroundStyle(Tema.tinta2)
                            }
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .superficie(radio: Tema.radioL)
            }
        }
    }

    private func titulos(_ u: Universo, color: Color, _ catalogo: Catalogo) -> some View {
        let todos = catalogo.titulos(de: u)
        let pr = progreso.progreso(de: u)
        // como la web: el filtro solo aparece en Tierras largas y a medias
        let puedeFiltrar = todos.count > 8 && pr.vistos > 0 && pr.vistos < pr.total
        let lista = puedeFiltrar && soloPendientes ? todos.filter { !progreso.visto($0.id) } : todos
        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Rotulo(texto: ajustes.tr("Sus títulos", "Its titles"))
                Spacer()
                if puedeFiltrar {
                    Button(soloPendientes ? ajustes.tr("Ver los \(todos.count)", "Show all \(todos.count)")
                                          : ajustes.tr("Solo lo que falta (\(pr.total - pr.vistos))", "Only what's left (\(pr.total - pr.vistos))")) {
                        withAnimation(.snappy) { soloPendientes.toggle() }
                    }
                    .font(.footnote.weight(.semibold))
                    .buttonStyle(.bordered)
                    .tint(color)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 26)
            .padding(.bottom, 6)
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(lista) { t in
                    Nodo(titulo: t, color: Color(hex: catalogo.coloresEra(de: t.id)?.first) ?? color)
                }
            }
            .padding(.bottom, 28)
        }
    }
}
