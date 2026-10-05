import SwiftUI
import MaratonKit

/// «Tu mes» de la web con su calendario: cifras del mes, una frase (la saga del
/// mes y la diferencia con el anterior), tu favorito y los días con marcas.
/// Tocar un día enseña lo que marcaste.
struct SeccionTuMes: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav
    /// El mes que miras (nil = el actual); se guarda el mes y no su posición,
    /// para que importar marcas de otros meses no te cambie de mes
    @State private var visto: Mes?
    @State private var dia: Int?

    private var cal: Calendar { .current }

    var body: some View {
        let meses = progreso.mesesConMarcas()
        let mes = visto.flatMap { meses.contains($0) ? $0 : nil } ?? meses[0]
        let r = progreso.resumen(mes: mes)
        // si el día tocado se queda sin marcas (lo desmarcaste desde la ficha), se cierra
        let dia = dia.flatMap { r.porDia[$0] != nil ? $0 : nil }
        if meses.count > 1 || r.dias > 0 {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text(ajustes.tr("Tu mes", "Your month")).font(.title3.weight(.bold))
                    Spacer()
                    navegacion(meses: meses, mes: mes)
                }
                if r.dias == 0 {
                    Text(ajustes.tr("Aún no has marcado nada en \(nombre(mes)).", "Nothing checked off in \(nombre(mes)) yet."))
                        .font(.subheadline).foregroundStyle(Tema.tinta2)
                } else {
                    cifras(r)
                    if let f = frase(r, mes: mes) {
                        Text(f).font(.subheadline).foregroundStyle(Tema.tinta2)
                    }
                    if let fav = r.favorito, let t = catalogo?.titulo(fav) { favorito(t) }
                }
                Calendario(mes: mes, porDia: r.porDia, seleccion: Binding(get: { dia }, set: { self.dia = $0 }))
                if let dia, let fecha = cal.date(byAdding: .day, value: dia - 1, to: mes.primerDia(cal)) {
                    DelDia(fecha: fecha)
                }
            }
            .padding(16)
            .superficie(radio: Tema.radioL)
            .onChange(of: mes) { self.dia = nil }
            .animation(.snappy, value: dia)
        }
    }

    private func navegacion(meses: [Mes], mes: Mes) -> some View {
        let i = meses.firstIndex(of: mes) ?? 0
        return HStack(spacing: 4) {
            Button { visto = meses[min(i + 1, meses.count - 1)] } label: { Image(systemName: "chevron.left").frame(width: 36, height: 36) }
                .disabled(i >= meses.count - 1)
                .accessibilityLabel(ajustes.tr("Mes anterior", "Previous month"))
            Text(nombre(mes).prefix(1).uppercased() + nombre(mes).dropFirst())
                .font(.subheadline.weight(.semibold))
                .frame(minWidth: 96)
                .contentTransition(.numericText())
            Button { visto = meses[max(0, i - 1)] } label: { Image(systemName: "chevron.right").frame(width: 36, height: 36) }
                .disabled(i == 0)
                .accessibilityLabel(ajustes.tr("Mes siguiente", "Next month"))
        }
        .buttonStyle(.plain)
        .foregroundStyle(Tema.tinta)
        .animation(.snappy, value: mes)
    }

    private func cifras(_ r: ResumenMes) -> some View {
        let horas = r.minutos >= 60 ? "\(Int((r.minutos / 60).rounded())) h" : "\(Int(r.minutos.rounded())) min"
        return HStack(alignment: .top) {
            Cifra(valor: horas, texto: ajustes.tr("vistas", "watched"))
            Spacer()
            Cifra(valor: "\(r.titulos)", texto: r.titulos == 1 ? ajustes.tr("título", "title") : ajustes.tr("títulos", "titles"))
            Spacer()
            Cifra(valor: "\(r.episodios)", texto: r.episodios == 1 ? ajustes.tr("episodio", "episode") : ajustes.tr("episodios", "episodes"))
            Spacer()
            Cifra(valor: "\(r.dias)", texto: r.dias == 1 ? ajustes.tr("día activo", "active day") : ajustes.tr("días activos", "active days"),
                  extra: r.racha > 1 ? ajustes.tr("racha de \(r.racha) días", "\(r.racha)-day streak") : nil)
        }
    }

    private func favorito(_ t: Titulo) -> some View {
        Button { nav.abre(t, desde: "favmes:\(t.id)") } label: {
            HStack(spacing: 12) {
                Poster(url: catalogo?.urlPoster(t.id, idioma: ajustes.idioma), ancho: 44, radio: Tema.radioS)
                    .origenZoom("favmes:\(t.id)", radio: Tema.radioS)
                VStack(alignment: .leading, spacing: 3) {
                    Rotulo(texto: ajustes.tr("Tu favorito del mes", "Your favorite this month"), color: Tema.oro)
                    Text(catalogo?.nombre(t, en: ajustes.idioma) ?? t.t).font(.subheadline.weight(.semibold)).foregroundStyle(Tema.tinta)
                    Estrellas(n: progreso.nota(t.id).p ?? 0)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Tema.tinta3)
            }
            .padding(10)
            .background(Tema.panel2, in: .rect(cornerRadius: Tema.radioM))
        }
        .buttonStyle(.plain)
    }

    /// «Sobre todo la saga X-Men (3 títulos) · 4 h más que en agosto», como la web
    private func frase(_ r: ResumenMes, mes: Mes) -> String? {
        var partes: [String] = []
        let nombres = ["xmen": ("la saga X-Men", "the X-Men saga"), "ucm": ("el UCM", "the MCU"),
                       "comics": ("los cómics", "the comics"), "animacion": ("la animación", "animation")]
        if let s = r.saga {
            let n = nombres[s.id] ?? (s.id, s.id)
            partes.append(ajustes.tr("sobre todo \(n.0) (\(s.n) títulos)", "mostly \(n.1) (\(s.n) titles)"))
        }
        let antes = progreso.resumen(mes: mes.anterior)
        let dif = Int(((r.minutos - antes.minutos) / 60).rounded())
        if antes.dias > 0 && dif != 0 {
            let m = nombre(mes.anterior, conAnio: false)
            partes.append(dif > 0 ? ajustes.tr("\(dif) h más que en \(m)", "\(dif) h more than in \(m)")
                                  : ajustes.tr("\(-dif) h menos que en \(m)", "\(-dif) h less than in \(m)"))
        }
        guard !partes.isEmpty else { return nil }
        let f = partes.joined(separator: " · ")
        return f.prefix(1).uppercased() + f.dropFirst()
    }

    private var locale: Locale { Locale(identifier: ajustes.idioma == .en ? "en_US" : "es_CL") }

    private func nombre(_ mes: Mes, conAnio: Bool? = nil) -> String {
        let anio = conAnio ?? (mes.anio != cal.component(.year, from: .now))
        let estilo = Date.FormatStyle(locale: locale, calendar: cal)
        return mes.primerDia(cal).formatted(anio ? estilo.month(.wide).year() : estilo.month(.wide))
    }
}

private struct Cifra: View {
    let valor: String
    let texto: String
    var extra: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(valor).font(.title2.weight(.bold).monospacedDigit()).foregroundStyle(Tema.tinta)
            Text(texto).font(.caption).foregroundStyle(Tema.tinta2)
            if let extra { Text(extra).font(.caption2.weight(.semibold)).foregroundStyle(Tema.oro) }
        }
    }
}

/// La nota en estrellas. Crece con el tamaño de letra del sistema, con tope:
/// en «Tus favoritas» va encima de un póster de ancho fijo.
struct Estrellas: View {
    let n: Int
    var color: Color = Tema.oro
    @ScaledMetric(relativeTo: .caption2) private var tamano: CGFloat = 10
    var body: some View {
        HStack(spacing: 1) { ForEach(0..<n, id: \.self) { _ in Image(systemName: "star.fill") } }
            .font(.system(size: min(tamano, 13), weight: .bold))
            .foregroundStyle(color)
            .accessibilityLabel("\(n) ★")
    }
}

/// La cuadrícula del mes: cada día con marcas lleva un círculo más intenso
/// cuantas más marcas tenga
private struct Calendario: View {
    let mes: Mes
    let porDia: [Int: Int]
    @Binding var seleccion: Int?
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        let cal = Calendar.current
        let primero = mes.primerDia(cal)
        let dias = cal.range(of: .day, in: .month, for: primero)?.count ?? 30
        let hueco = (cal.component(.weekday, from: primero) - cal.firstWeekday + 7) % 7
        let hoy = Mes(.now, cal) == mes ? cal.component(.day, from: .now) : nil
        let tope = max(1, porDia.values.max() ?? 1)
        let simbolos = semana(cal)
        let columnas = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
        LazyVGrid(columns: columnas, spacing: 4) {
            // ids distintos en los tres ForEach: si se repiten (0…6 de la semana
            // y 1…6 de los días) la cuadrícula perezosa no pinta esos días
            ForEach(simbolos.indices.map { "s\($0)" }, id: \.self) { k in
                Text(simbolos[Int(k.dropFirst())!]).font(.caption2.weight(.bold)).foregroundStyle(Tema.tinta3)
            }
            ForEach((0..<hueco).map { "h\($0)" }, id: \.self) { _ in Color.clear.frame(height: 36) }
            ForEach((1...dias).map { $0 }, id: \.self) { d in
                let n = porDia[d] ?? 0
                Button { seleccion = seleccion == d || n == 0 ? nil : d } label: {
                    Text("\(d)")
                        .font(.footnote.weight(n > 0 ? .bold : .regular).monospacedDigit())
                        .foregroundStyle(n > 0 ? Tema.tinta : Tema.tinta3)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background {
                            if n > 0 { Circle().fill(Tema.oro.opacity(0.18 + 0.5 * Double(n) / Double(tope))).padding(2) }
                        }
                        .overlay {
                            if seleccion == d { Circle().strokeBorder(Tema.tinta, lineWidth: 2).padding(2) }
                            else if hoy == d { Circle().strokeBorder(Tema.rojo, lineWidth: 1.5).padding(2) }
                        }
                }
                .buttonStyle(.plain)
                .disabled(n == 0)
                .accessibilityLabel(ajustes.tr("Día \(d): \(n) marcas", "Day \(d): \(n) check-offs"))
            }
        }
    }

    private func semana(_ cal: Calendar) -> [String] {
        var c = cal
        c.locale = Locale(identifier: ajustes.idioma == .en ? "en_US" : "es_CL")
        let s = c.veryShortStandaloneWeekdaySymbols
        let i = cal.firstWeekday - 1
        return Array(s[i...] + s[..<i])
    }
}

/// Lo que marcaste el día tocado
private struct DelDia: View {
    let fecha: Date
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rotulo(texto: fecha.formatted(.dateTime.weekday(.wide).day().month(.wide)
                .locale(Locale(identifier: ajustes.idioma == .en ? "en_US" : "es_CL"))))
            ForEach(progreso.marcas(dia: fecha)) { m in
                if let t = catalogo?.titulo(m.id) {
                    Fila(titulo: t, seccion: "dia", detalle: m.episodios > 0
                         ? ajustes.tr("\(m.episodios) episodio\(m.episodios == 1 ? "" : "s")", "\(m.episodios) episode\(m.episodios == 1 ? "" : "s")")
                         : t.id.hasPrefix("c-") ? ajustes.tr("Leído", "Read") : ajustes.tr("Completa", "In full"))
                }
            }
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}

/// Fila con carátula que abre la ficha (calendario y diario)
private struct Fila: View {
    let titulo: Titulo
    /// «dia» o «diario»: el mismo título puede salir en los dos (clave de su zoom)
    let seccion: String
    let detalle: String
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Navegacion.self) private var nav

    var body: some View {
        Button { nav.abre(titulo, desde: "estad:\(seccion):\(titulo.id)") } label: {
            HStack(spacing: 12) {
                Poster(url: catalogo?.urlPoster(titulo.id, idioma: ajustes.idioma), ancho: 36, radio: Tema.radioS)
                    .origenZoom("estad:\(seccion):\(titulo.id)", radio: Tema.radioS)
                VStack(alignment: .leading, spacing: 2) {
                    Text(catalogo?.nombre(titulo, en: ajustes.idioma) ?? titulo.t)
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Tema.tinta).lineLimit(1)
                    HStack(spacing: 6) {
                        Text(detalle).font(.caption).foregroundStyle(Tema.tinta2)
                        if let p = progreso.nota(titulo.id).p { Estrellas(n: p) }
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Tema.tinta3)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

/// El diario del maratón: lo último que marcaste, por meses. Plegado a 5.
struct SeccionDiario: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @State private var abierto = false
    private static let plegado = 5

    var body: some View {
        let todo = progreso.diario()
        if !todo.isEmpty {
            let lista = abierto ? todo : Array(todo.prefix(Self.plegado))
            let locale = Locale(identifier: ajustes.idioma == .en ? "en_US" : "es_CL")
            let cal = Calendar.current
            let grupos = Dictionary(grouping: lista) { Mes($0.fecha, cal) }.sorted { $0.key > $1.key }
            VStack(alignment: .leading, spacing: 12) {
                Text(ajustes.tr("Diario del maratón", "Marathon diary")).font(.title3.weight(.bold))
                ForEach(grupos, id: \.key) { mes, filas in
                    let actual = mes.anio == cal.component(.year, from: .now)
                    Rotulo(texto: mes.primerDia(cal).formatted(.dateTime.month(.wide).year(actual ? .omitted : .defaultDigits).locale(locale)))
                    ForEach(filas, id: \.id) { x in
                        if let t = catalogo?.titulo(x.id) {
                            Fila(titulo: t, seccion: "diario", detalle: x.fecha.formatted(.dateTime.weekday(.abbreviated).day().locale(locale)))
                        }
                    }
                }
                if todo.count > Self.plegado {
                    Button(abierto ? ajustes.tr("Ver menos", "Show less") : ajustes.tr("Ver los \(todo.count)", "Show all \(todo.count)")) {
                        withAnimation(.snappy) { abierto.toggle() }
                    }
                    .font(.subheadline.weight(.semibold))
                    .tint(Tema.rojo)
                }
            }
            .padding(16)
            .superficie(radio: Tema.radioL)
        }
    }
}
