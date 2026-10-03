import SwiftUI
import MaratonKit

/// Inicio: lo que toca ahora y un carrusel por saga, como el Inicio de la web
struct InicioView: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if let catalogo {
                        Continuar(catalogo: catalogo)
                        ForEach(catalogo.sagas) { saga in
                            Carrusel(saga: saga, catalogo: catalogo)
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .background(Tema.fondo)
            .navigationTitle(ajustes.tr("Tu maratón", "Your marathon"))
        }
    }
}

private struct Continuar: View {
    let catalogo: Catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        let r = progreso.resumen
        VStack(alignment: .leading, spacing: 14) {
            if let t = progreso.siguiente() {
                Button { nav.ficha = t } label: {
                    HStack(alignment: .top, spacing: 14) {
                        Poster(url: catalogo.urlPoster(t.id, idioma: ajustes.idioma), ancho: 92)
                        VStack(alignment: .leading, spacing: 6) {
                            Text(ajustes.tr("A continuación", "Up next"))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Tema.color(saga: catalogo.saga(de: t.id)))
                            Text(catalogo.nombre(t, en: ajustes.idioma))
                                .font(.title3.weight(.bold))
                                .foregroundStyle(Tema.tinta)
                                .multilineTextAlignment(.leading)
                            Text(Formato.meta(t, catalogo: catalogo))
                                .font(.footnote).foregroundStyle(Tema.tinta2)
                            if let plat = catalogo.plataforma(t, pais: ajustes.pais) {
                                Text(plat).font(.footnote.weight(.medium)).foregroundStyle(Tema.tinta2)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
                .buttonStyle(.plain)
                Button {
                    withAnimation(.snappy) { progreso.alternar(t.id) }
                } label: {
                    Label(ajustes.tr("Marcar como visto", "Mark as watched"), systemImage: "checkmark")
                        .font(.body.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .shadow(color: Tema.rojo.opacity(0.3), radius: 8, y: 4)
            } else {
                Text(ajustes.tr("Maratón completo", "Marathon complete"))
                    .font(.title2.weight(.bold))
            }
            VStack(alignment: .leading, spacing: 6) {
                Barra(fraccion: r.fraccion)
                Text(ajustes.tr("\(r.vistos) de \(r.total) · faltan \(Formato.duracion(r.minutosRestantes))",
                                "\(r.vistos) of \(r.total) · \(Formato.duracion(r.minutosRestantes)) left"))
                    .font(.footnote.monospacedDigit()).foregroundStyle(Tema.tinta2)
            }
        }
        .padding(16)
        .superficie()
        .padding(.horizontal, 16)
    }
}

private struct Carrusel: View {
    let saga: Saga
    let catalogo: Catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        let titulos = saga.eras.flatMap(\.items)
        let vistos = titulos.filter { progreso.visto($0.id) }.count
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(catalogo.texto(saga.titulo, en: ajustes.idioma) ?? saga.titulo).font(.title3.weight(.bold))
                Spacer()
                Text("\(vistos)/\(titulos.count)")
                    .font(.footnote.monospacedDigit()).foregroundStyle(Tema.tinta2)
            }
            .padding(.horizontal, 16)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 12) {
                    ForEach(titulos) { t in
                        Button { nav.ficha = t } label: {
                            Poster(url: catalogo.urlPoster(t.id, idioma: ajustes.idioma), ancho: 104)
                                .overlay(alignment: .topTrailing) {
                                    if progreso.visto(t.id) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .font(.title3)
                                            .foregroundStyle(.white, Tema.color(saga: saga.saga))
                                            .padding(6)
                                    }
                                }
                                .opacity(progreso.visto(t.id) ? 0.75 : 1)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(catalogo.nombre(t, en: ajustes.idioma))
                    }
                }
                .padding(.horizontal, 16)
            }
            .scrollIndicators(.hidden)
        }
    }
}
