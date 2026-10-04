import SwiftUI
import MaratonKit

/// El Multiverso de la web: la Tierra-616 en el centro y las demás girando en
/// cuatro anillos, cada planeta con el arco de lo que llevas de él. Tocar un
/// planeta dice qué Tierra es; tocarlo otra vez (o «Entrar») abre su página.
/// Debajo, el índice por anillo, que en el móvil hace de nombres.
struct MultiversoView: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @State private var ruta: [String] = []
    @State private var elegida: String?

    var body: some View {
        NavigationStack(path: $ruta) {
            ScrollView {
                if let catalogo {
                    VStack(alignment: .leading, spacing: 20) {
                        cabecera(catalogo)
                        SistemaSolar(elegida: $elegida) { ruta.append($0) }
                            .padding(.horizontal, 8)
                        seleccion(catalogo)
                            .padding(.horizontal, 16)
                        indice(catalogo)
                            .padding(.horizontal, 16)
                            .padding(.bottom, 24)
                    }
                }
            }
            .background(Tema.fondo)
            .ignoresSafeArea(edges: .top)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { TierraView(num: $0) }
        }
        #if DEBUG
        // capturas: `-tierra Tierra-10005` entra directo
        .task { if let t = UserDefaults.standard.string(forKey: "tierra") { ruta = [t] } }
        #endif
    }

    private func cabecera(_ catalogo: Catalogo) -> some View {
        let r = progreso.resumenMultiverso
        let doomsday = catalogo.titulo("doomsday").map { catalogo.nombre($0, en: ajustes.idioma) } ?? "Doomsday"
        return CabeceraPestana(titulo: ajustes.tr("Multiverso", "Multiverse"), fotograma: catalogo.urlFotograma("loki2"),
                               color: Color(hex: "#8A81EF") ?? Tema.azul) {
            Text(ajustes.tr("Los universos que hay que conocer antes de \(doomsday). Entra en cada Tierra para ver y marcar todo lo que ocurre en ella.",
                            "The universes you should know before \(doomsday). Enter each Earth to see and check off everything that happens in it."))
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("\(Int((100 * r.fraccion).rounded())) %")
                        .font(Tema.marca(30))
                        .contentTransition(.numericText())
                    Text(ajustes.tr("del multiverso visto · \(r.completas) de \(r.cuentan) Tierras completas",
                                    "of the multiverse watched · \(r.completas) of \(r.cuentan) Earths complete"))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.8))
                }
                BarraMarca(fraccion: r.fraccion)
            }
        }
    }

    @ViewBuilder
    private func seleccion(_ catalogo: Catalogo) -> some View {
        if let num = elegida, let u = catalogo.universo(num) {
            let pr = progreso.progreso(de: u)
            let color = Color(hex: u.c) ?? Tema.rojo
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 14) {
                    Orbe(color: color, rasgo: u.rasgo, diametro: 52)
                        .frame(width: 64, height: 64)
                    VStack(alignment: .leading, spacing: 3) {
                        Rotulo(texto: catalogo.numero(u.num, en: ajustes.idioma), color: color)
                        Text(catalogo.texto(u.nombre, en: ajustes.idioma) ?? u.nombre)
                            .font(.title3.weight(.bold))
                        if let e = catalogo.texto(u.estado, en: ajustes.idioma) {
                            Text(e).font(.footnote).foregroundStyle(Tema.tinta2)
                        }
                    }
                }
                Barra(fraccion: pr.fraccion, color: color)
                Group {
                    if let sig = progreso.siguiente(en: u) {
                        Text("\(pr.vistos) / \(pr.total) \(ajustes.tr("vistos", "watched")) · \(ajustes.tr("siguiente:", "next:")) \(Text(catalogo.nombre(sig, en: ajustes.idioma)).bold())")
                    } else {
                        Text("\(pr.vistos) / \(pr.total) · \(ajustes.tr("Completaste esta Tierra", "You completed this Earth"))")
                    }
                }
                .font(.footnote).foregroundStyle(Tema.tinta2)
                HStack {
                    Button(ajustes.tr("Entrar en esta Tierra", "Enter this Earth")) { ruta.append(u.num) }
                        .buttonStyle(.borderedProminent)
                        .tint(color)
                    Button(ajustes.tr("Cerrar", "Close")) { withAnimation(.snappy) { elegida = nil } }
                        .buttonStyle(.bordered)
                        .tint(Tema.tinta2)
                }
                .font(.subheadline.weight(.semibold))
            }
            .padding(16)
            .superficie()
            .transition(.opacity.combined(with: .scale(scale: 0.97)))
            .id(u.num)
        } else {
            Text(ajustes.tr("Toca un planeta para ver qué Tierra es; tócalo otra vez para entrar.",
                            "Tap a planet to see which Earth it is; tap it again to enter."))
                .font(.footnote)
                .foregroundStyle(Tema.tinta2)
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
        }
    }

    private func indice(_ catalogo: Catalogo) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            seccion(ajustes.tr("El centro", "The center"), ajustes.tr("La línea sagrada", "The sacred timeline"),
                    [catalogo.universo("Tierra-616")].compactMap { $0 }, catalogo)
            ForEach(catalogo.anillos, id: \.r) { a in
                seccion(a.titulo(en: ajustes.idioma), a.descripcion(en: ajustes.idioma), catalogo.universos(anillo: a), catalogo)
            }
        }
    }

    private func seccion(_ titulo: String, _ desc: String, _ tierras: [Universo], _ catalogo: Catalogo) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Rotulo(texto: titulo)
                Text(desc).font(.caption).foregroundStyle(Tema.tinta3)
            }
            .padding(.horizontal, 4)
            VStack(spacing: 0) {
                ForEach(Array(tierras.enumerated()), id: \.element.num) { i, u in
                    if i > 0 { Divider().padding(.leading, 40) }
                    FilaTierra(universo: u)
                }
            }
            .superficie(radio: Tema.radioL)
        }
    }
}

/// Una Tierra en el índice: punto de su color, número, nombre y cuánto llevas
private struct FilaTierra: View {
    let universo: Universo
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        let pr = progreso.progreso(de: universo)
        let color = Color(hex: universo.c) ?? Tema.rojo
        NavigationLink(value: universo.num) {
            HStack(spacing: 12) {
                Circle().fill(color).frame(width: 12, height: 12)
                    .shadow(color: color.opacity(0.6), radius: 4)
                    .frame(width: 16)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(catalogo?.numero(universo.num, en: ajustes.idioma) ?? universo.num).font(.subheadline.weight(.bold))
                        if universo.opc == true { Etiqueta(texto: ajustes.tr("Opcional", "Optional")) }
                    }
                    Text(catalogo?.texto(universo.nombre, en: ajustes.idioma) ?? universo.nombre)
                        .font(.footnote).foregroundStyle(Tema.tinta2)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                if pr.completa {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(Tema.verde)
                        .accessibilityLabel(ajustes.tr("Completa", "Complete"))
                }
                Text("\(pr.vistos)/\(pr.total)")
                    .font(.footnote.monospacedDigit().weight(.semibold))
                    .foregroundStyle(pr.completa ? Tema.verde : Tema.tinta2)
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Tema.tinta3)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 56)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

/// El sistema: anillos, la 616 de sol y los planetas en órbita. Con «Reducir
/// movimiento» se quedan quietos en su ángulo de salida.
private struct SistemaSolar: View {
    @Binding var elegida: String?
    let entrar: (String) -> Void
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(\.accessibilityReduceMotion) private var reducir
    @Environment(\.scenePhase) private var fase
    @State private var visible = false
    /// El reloj de las órbitas: arranca en 0 para que salgan en su ángulo de la web
    @State private var inicio = Date()

    /// Del centro al borde del anillo más grande, con el planeta más grande (335 + 62/2 + aire)
    private let radioMundo: CGFloat = 380

    var body: some View {
        GeometryReader { g in
            let lado = min(g.size.width, g.size.height)
            let escala = lado / (2 * radioMundo)
            let centro = CGPoint(x: g.size.width / 2, y: g.size.height / 2)
            // Lo que no se mueve se calcula fuera del reloj: en cada cuadro solo cambia la posición
            let planetas = (catalogo?.multiverso ?? []).compactMap { u in
                catalogo?.orbita(u.num).map { (universo: u, orbita: $0, progreso: progreso.progreso(de: u)) }
            }
            let sol = catalogo?.universo("Tierra-616")
            TimelineView(.animation(paused: reducir || !visible || fase != .active)) { ctx in
                let t = reducir ? 0 : ctx.date.timeIntervalSince(inicio)
                ZStack {
                    ForEach(catalogo?.anillos ?? [], id: \.r) { a in
                        Circle()
                            .strokeBorder(Tema.linea, style: StrokeStyle(lineWidth: 1, dash: [3, 5]))
                            .frame(width: 2 * a.r * escala, height: 2 * a.r * escala)
                            .position(centro)
                    }
                    if let sol {
                        planeta(sol, progreso: progreso.progreso(de: sol), diametro: 92 * escala).position(centro)
                    }
                    ForEach(planetas, id: \.universo.num) { p in
                        // como el CSS: rotate(fase) y una vuelta cada `segundos`, en su sentido
                        let o = p.orbita
                        let rad = (o.fase + o.sentido * 360 * t / o.segundos - 90) * .pi / 180
                        planeta(p.universo, progreso: p.progreso, diametro: o.diametro * escala)
                            .position(x: centro.x + cos(rad) * o.radio * escala, y: centro.y + sin(rad) * o.radio * escala)
                    }
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
        .onAppear { visible = true }
        .onDisappear { visible = false }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(ajustes.tr("Sistema del multiverso", "Multiverse system"))
    }

    private func planeta(_ u: Universo, progreso pr: Progreso.ProgresoTierra, diametro: CGFloat) -> some View {
        Planeta(universo: u, progreso: pr, diametro: diametro, elegida: elegida == u.num,
                atenuada: elegida != nil && elegida != u.num) {
            if elegida == u.num { entrar(u.num) } else { withAnimation(.snappy) { elegida = u.num } }
        }
        .equatable()
    }
}

/// Un planeta tocable. Equatable sin la acción: con las órbitas en marcha,
/// SwiftUI solo vuelve a pintarlo si cambia lo que enseña, no en cada cuadro.
private struct Planeta: View, Equatable {
    let universo: Universo
    let progreso: Progreso.ProgresoTierra
    let diametro: CGFloat
    let elegida: Bool
    let atenuada: Bool
    let accion: () -> Void
    @Environment(\.catalogo) private var catalogo
    @Environment(Ajustes.self) private var ajustes

    nonisolated static func == (a: Self, b: Self) -> Bool {
        a.universo == b.universo && a.progreso == b.progreso && a.diametro == b.diametro
            && a.elegida == b.elegida && a.atenuada == b.atenuada
    }

    var body: some View {
        let u = universo
        Button(action: accion) {
            Orbe(color: Color(hex: u.c) ?? Tema.rojo, rasgo: u.rasgo, diametro: diametro, progreso: progreso.fraccion, elegida: elegida)
                .frame(width: max(44, diametro + 12), height: max(44, diametro + 12))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .opacity(atenuada ? 0.55 : 1)
        .scaleEffect(elegida ? 1.12 : 1)
        .animation(.snappy, value: elegida)
        .sensoryFeedback(.selection, trigger: elegida) { _, nuevo in nuevo }
        .accessibilityLabel("\(catalogo?.numero(u.num, en: ajustes.idioma) ?? u.num): \(catalogo?.texto(u.nombre, en: ajustes.idioma) ?? u.nombre). \(progreso.vistos) / \(progreso.total)")
        .accessibilityHint(elegida ? ajustes.tr("Toca para entrar", "Tap to enter") : "")
        .accessibilityAddTraits(elegida ? .isSelected : [])
    }
}

/// Un planeta: halo, volumen con luz arriba a la izquierda y el rasgo que lo
/// distingue (anillo del Vacío, luna de la 828, negro del simbionte, ramas
/// de What If, manchas de la plaga, trama de los cómics). Con `progreso`,
/// un arco dorado alrededor con lo que llevas de esa Tierra.
struct Orbe: View {
    let color: Color
    let rasgo: String?
    let diametro: CGFloat
    var progreso: Double? = nil
    var elegida = false

    var body: some View {
        let d = diametro
        ZStack {
            Circle().fill(color.opacity(elegida ? 0.55 : 0.32))
                .frame(width: d * 1.25, height: d * 1.25)
                .blur(radius: d * 0.16)
            if rasgo == "anillo" { anillo(d).mask(Rectangle().frame(height: d * 0.5).offset(y: -d * 0.25)) }
            Circle()
                .fill(RadialGradient(colors: [color.mix(with: .white, by: 0.35), color, color.mix(with: .black, by: 0.6)],
                                     center: UnitPoint(x: 0.32, y: 0.28), startRadius: 0, endRadius: d * 0.78))
                .overlay { rasgoInterior(d) }
                .clipShape(Circle())
                .overlay(Circle().strokeBorder(.white.opacity(0.18), lineWidth: 0.75))
                .frame(width: d, height: d)
            if rasgo == "anillo" { anillo(d).mask(Rectangle().frame(height: d * 0.5).offset(y: d * 0.25)) }
            if rasgo == "luna" {
                Circle().fill(RadialGradient(colors: [.white, Color(white: 0.6)], center: UnitPoint(x: 0.3, y: 0.3),
                                             startRadius: 0, endRadius: d * 0.14))
                    .frame(width: d * 0.24, height: d * 0.24)
                    .offset(x: d * 0.56, y: -d * 0.42)
            }
            if rasgo == "ramas" {
                ForEach([-28.0, 28.0], id: \.self) { g in
                    Ellipse().stroke(color.mix(with: .white, by: 0.4).opacity(0.7), lineWidth: max(0.75, d * 0.025))
                        .frame(width: d * 1.5, height: d * 0.42)
                        .rotationEffect(.degrees(g))
                }
            }
            if let progreso {
                Circle().stroke(.white.opacity(0.12), lineWidth: 2)
                    .frame(width: d + 8, height: d + 8)
                if progreso > 0 {
                    Circle().trim(from: 0, to: min(1, progreso))
                        .stroke(Tema.oroVivo, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .frame(width: d + 8, height: d + 8)
                }
            }
        }
        .accessibilityHidden(true)
    }

    private func anillo(_ d: CGFloat) -> some View {
        Ellipse()
            .stroke(color.mix(with: .white, by: 0.5).opacity(0.85), lineWidth: max(1, d * 0.06))
            .frame(width: d * 1.65, height: d * 0.48)
            .rotationEffect(.degrees(-18))
    }

    @ViewBuilder
    private func rasgoInterior(_ d: CGFloat) -> some View {
        switch rasgo {
        case "simbionte":
            RadialGradient(colors: [.clear, .black.opacity(0.75)], center: UnitPoint(x: 0.65, y: 0.7),
                           startRadius: 0, endRadius: d * 0.7)
        case "plaga":
            Canvas { ctx, size in
                let manchas: [(CGFloat, CGFloat, CGFloat)] = [(0.25, 0.6, 0.16), (0.62, 0.35, 0.12), (0.7, 0.72, 0.18), (0.4, 0.22, 0.08)]
                for (x, y, r) in manchas {
                    let rect = CGRect(x: x * size.width - r * size.width, y: y * size.height - r * size.height,
                                      width: 2 * r * size.width, height: 2 * r * size.height)
                    ctx.fill(Path(ellipseIn: rect), with: .color(.black.opacity(0.35)))
                }
            }
        case "trama":
            Canvas { ctx, size in
                let paso = max(3, size.width / 9)
                var y: CGFloat = paso / 2
                while y < size.height {
                    var x: CGFloat = paso / 2
                    while x < size.width {
                        ctx.fill(Path(ellipseIn: CGRect(x: x - paso * 0.16, y: y - paso * 0.16, width: paso * 0.32, height: paso * 0.32)),
                                 with: .color(.white.opacity(0.3)))
                        x += paso
                    }
                    y += paso
                }
            }
        default:
            EmptyView()
        }
    }
}
