// Las vistas del widget. Compartidas con la app solo para dibujarlas en
// depuración (`-capturaWidget YES`): sin app Simulator no se puede añadir un
// widget al escritorio desde la terminal.
import ImageIO
import SwiftUI
import UIKit
import WidgetKit

struct Entrada: TimelineEntry {
    let date: Date
    let foto: FotoWidget?

    /// Días que faltan a la meta, contados en días del calendario
    var dias: Int? {
        guard let m = foto?.meta else { return nil }
        let cal = Calendar.current
        // ya estrenado y la app sin abrir desde entonces: sin cuenta atrás (no «hoy» varios días)
        guard let d = cal.dateComponents([.day], from: cal.startOfDay(for: date), to: m.fecha).day, d >= 0 else { return nil }
        return d
    }
    /// La primera sesión del horario que no ha terminado de empezar
    var sesion: FotoWidget.Sesion? { foto?.sesiones.first { $0.fecha >= date } }
}

// MARK: Vistas

struct VistaWidget: View {
    let entrada: Entrada
    @Environment(\.widgetFamily) private var familia

    var body: some View {
        switch familia {
        case .accessoryCircular: Circular(entrada: entrada)
        case .accessoryRectangular: Rectangular(entrada: entrada)
        case .accessoryInline: EnLinea(entrada: entrada)
        case .systemMedium: Mediano(entrada: entrada)
        default: Pequeno(entrada: entrada)
        }
    }
}

/// Los colores de la web (Tema.swift de la app), en oscuro: el widget va sobre el póster
enum Colores {
    static let rojo = Color(red: 0xF8 / 255, green: 0x4A / 255, blue: 0x54 / 255)
    static let oro = Color(red: 0xE8 / 255, green: 0xA9 / 255, blue: 0x3C / 255)
    static let azul = Color(red: 0x7B / 255, green: 0xA6 / 255, blue: 0xE4 / 255)
    static let fondo = Color(red: 0x0A / 255, green: 0x0C / 255, blue: 0x14 / 255)
    static let panel = Color(red: 0x13 / 255, green: 0x17 / 255, blue: 0x25 / 255)
    static func de(saga: String?) -> Color {
        switch saga {
        case "xmen": oro
        case "animacion": azul
        default: rojo
        }
    }
}

private extension FotoWidget {
    var acento: Color { Colores.de(saga: siguiente?.saga) }
    var porcentaje: String { "\(Int((fraccion * 100).rounded(.down))) %" }
    var urlFicha: URL? { siguiente.flatMap { URL(string: "maraton://abrir?id=\($0.id)") } }
    /// El póster del paquete de la app (el widget vive en Maraton.app/PlugIns), reducido
    /// al leerlo: un widget tiene poca memoria
    var imagenPoster: UIImage? {
        guard let ruta = siguiente?.poster else { return nil }
        let b = Bundle.main.bundleURL
        let app = b.pathExtension == "appex" ? b.deletingLastPathComponent().deletingLastPathComponent() : b
        guard let fuente = CGImageSourceCreateWithURL(app.appendingPathComponent(ruta) as CFURL, nil),
              let img = CGImageSourceCreateThumbnailAtIndex(fuente, 0, [
                  kCGImageSourceCreateThumbnailFromImageAlways: true,
                  kCGImageSourceThumbnailMaxPixelSize: 360] as CFDictionary) else { return nil }
        return UIImage(cgImage: img)
    }
    var horas: String {
        let h = minutosRestantes / 60
        return h > 0 ? tr("faltan \(h) h", "\(h) h left") : tr("faltan \(minutosRestantes) min", "\(minutosRestantes) min left")
    }
}

private func cuentaAtras(_ e: Entrada) -> String? {
    guard let f = e.foto, let m = f.meta, let d = e.dias else { return nil }
    switch d {
    case 0: return f.tr("\(m.nombre) se estrena hoy", "\(m.nombre) is out today")
    case 1: return f.tr("\(m.nombre) · mañana", "\(m.nombre) · tomorrow")
    default: return f.tr("\(m.nombre) · en \(d) días", "\(m.nombre) · in \(d) days")
    }
}

/// «Hoy 21:00», «Mañana 21:00» o «vie 21:00»
private func cuando(_ s: FotoWidget.Sesion, _ f: FotoWidget, desde: Date) -> String {
    let cal = Calendar.current
    let loc = Locale(identifier: f.en ? "en_US" : "es_CL")
    // 21:00 en español (es_CL daría «9:00 p.m.»), 9:00 PM en inglés
    let hora = f.en ? s.fecha.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(loc))
                    : s.fecha.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(Locale(identifier: "es_ES")))
    if cal.isDate(s.fecha, inSameDayAs: desde) { return f.tr("Hoy \(hora)", "Today \(hora)") }
    if let m = cal.date(byAdding: .day, value: 1, to: desde), cal.isDate(s.fecha, inSameDayAs: m) {
        return f.tr("Mañana \(hora)", "Tomorrow \(hora)")
    }
    return s.fecha.formatted(Date.FormatStyle().weekday(.abbreviated).locale(loc)) + " \(hora)"
}

/// La barra de avance: fina, con el color de la saga
private struct BarraWidget: View {
    let fraccion: Double
    let color: Color
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.22))
                Capsule().fill(color).frame(width: max(4, g.size.width * fraccion))
            }
        }
        .frame(height: 4)
    }
}

private struct RotuloWidget: View {
    let texto: String
    let color: Color
    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(texto.uppercased())
                .font(.system(size: 10, weight: .bold))
                .tracking(0.6)
                .lineLimit(1)
        }
        .foregroundStyle(.white.opacity(0.85))
    }
}

/// Póster a sangre con un velo abajo
private struct FondoPoster: View {
    let foto: FotoWidget?
    var body: some View {
        ZStack {
            Colores.fondo
            if let img = foto?.imagenPoster {
                Image(uiImage: img).resizable().scaledToFill()
            }
            LinearGradient(stops: [.init(color: .black.opacity(0.05), location: 0),
                                   .init(color: .black.opacity(0.55), location: 0.45),
                                   .init(color: .black.opacity(0.9), location: 1)],
                           startPoint: .top, endPoint: .bottom)
        }
    }
}

struct Pequeno: View {
    let entrada: Entrada
    var body: some View {
        let f = entrada.foto
        VStack(alignment: .leading, spacing: 6) {
            Spacer(minLength: 0)
            if let f, let s = f.siguiente {
                RotuloWidget(texto: f.tr("Siguiente", "Up next"), color: f.acento)
                Text(s.nombre)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(3)
                    .minimumScaleFactor(0.8)
                HStack(spacing: 6) {
                    BarraWidget(fraccion: f.fraccion, color: f.acento)
                    Text(f.porcentaje)
                        .font(.system(size: 11, weight: .semibold).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.85))
                        .fixedSize()
                }
            } else {
                SinSiguiente(entrada: entrada)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .fondoWidget { FondoPoster(foto: f) }
        .widgetURL(f?.urlFicha)
    }
}

struct Mediano: View {
    let entrada: Entrada
    var body: some View {
        let f = entrada.foto
        HStack(spacing: 14) {
            if let img = f?.imagenPoster {
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(2 / 3, contentMode: .fill)
                    .frame(width: 84)
                    .clipShape(.rect(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(.white.opacity(0.14)))
                    .shadow(color: .black.opacity(0.4), radius: 8, y: 4)
            }
            VStack(alignment: .leading, spacing: 5) {
                if let f, let s = f.siguiente {
                    RotuloWidget(texto: s.rotulo, color: f.acento)
                    Text(s.nombre)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                    Text(s.detalle)
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.7))
                        .lineLimit(1)
                    Spacer(minLength: 2)
                    HStack {
                        Text("\(f.vistos) / \(f.total)").monospacedDigit()
                        Spacer()
                        Text(f.horas)
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    BarraWidget(fraccion: f.fraccion, color: f.acento)
                    Pie(entrada: entrada)
                } else {
                    Spacer(minLength: 0)
                    SinSiguiente(entrada: entrada)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
        .padding(14)
        .fondoWidget {
            ZStack {
                Colores.panel
                LinearGradient(colors: [(f?.acento ?? Colores.rojo).opacity(0.28), .clear],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
            }
        }
        .widgetURL(f?.urlFicha)
    }
}

/// Debajo de la barra: la próxima sesión si hay horario; si no, la cuenta atrás
private struct Pie: View {
    let entrada: Entrada
    var body: some View {
        if let f = entrada.foto, let s = entrada.sesion {
            // si la sesión empieza por el siguiente, no se repite el nombre
            let texto = s.que == f.siguiente?.nombre ? f.tr("Sesión: \(cuando(s, f, desde: entrada.date).lowercased())",
                                                           "Session: \(cuando(s, f, desde: entrada.date))")
                                                    : "\(cuando(s, f, desde: entrada.date)) · \(s.que)"
            Label {
                Text(texto).lineLimit(1)
            } icon: { Image(systemName: "calendar") }
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(Colores.oro)
        } else if let texto = cuentaAtras(entrada) {
            Label { Text(texto).lineLimit(1) } icon: { Image(systemName: "hourglass") }
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Colores.oro)
        }
    }
}

/// Todo visto (o la app aún no abierta): la cuenta atrás o una invitación
private struct SinSiguiente: View {
    let entrada: Entrada
    var body: some View {
        let f = entrada.foto
        VStack(alignment: .leading, spacing: 4) {
            Text(f == nil ? "Abre la app para empezar" : f!.tr("Lo viste todo", "You've seen it all"))
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(.white)
            if let texto = cuentaAtras(entrada) {
                Text(texto)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Colores.oro)
            }
        }
    }
}

// MARK: Pantalla bloqueada (tinta del sistema, sin colores propios)

struct Circular: View {
    let entrada: Entrada
    var body: some View {
        let f = entrada.foto
        Gauge(value: f?.fraccion ?? 0) {
            Image(systemName: "film")
        } currentValueLabel: {
            Text("\(Int(((f?.fraccion ?? 0) * 100).rounded(.down)))")
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .fondoWidget { AccessoryWidgetBackground() }
        .widgetURL(f?.urlFicha)
    }
}

struct Rectangular: View {
    let entrada: Entrada
    var body: some View {
        let f = entrada.foto
        VStack(alignment: .leading, spacing: 2) {
            if let f, let s = f.siguiente {
                Text(f.tr("Siguiente · \(f.porcentaje)", "Up next · \(f.porcentaje)"))
                    .font(.caption2.weight(.semibold))
                    .widgetAccentable()
                Text(s.nombre).font(.headline).lineLimit(1)
                if let ses = entrada.sesion {
                    Text(cuando(ses, f, desde: entrada.date)).font(.caption2).lineLimit(1)
                } else if let texto = cuentaAtras(entrada) {
                    Text(texto).font(.caption2).lineLimit(1)
                }
            } else {
                Text(f?.tr("Lo viste todo", "You've seen it all") ?? "Maratón").font(.headline)
                if let texto = cuentaAtras(entrada) { Text(texto).font(.caption2).lineLimit(2) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fondoWidget { Color.clear }
        .widgetURL(f?.urlFicha)
    }
}

struct EnLinea: View {
    let entrada: Entrada
    var body: some View {
        // una línea corta: «Doomsday en 74 días» (sin «Vengadores:»)
        if let f = entrada.foto, let m = f.meta, let d = entrada.dias {
            let corto = m.nombre.components(separatedBy: ": ").last ?? m.nombre
            Label(d == 0 ? f.tr("\(corto) hoy", "\(corto) today")
                         : f.tr("\(corto) en \(d) días", "\(corto) in \(d) days"), systemImage: "hourglass")
        } else if let s = entrada.foto?.siguiente {
            Label(s.nombre, systemImage: "film")
        } else {
            Text("Maratón")
        }
    }
}

extension FotoWidget {
    /// Para la galería de widgets si la app aún no escribió nada
    static let ejemplo = FotoWidget(
        en: false,
        siguiente: .init(id: "", nombre: "Thunderbolts*", detalle: "2025 · 2 h 7 min",
                         rotulo: "Siguiente en UCM · 36 / 41", saga: "ucm", poster: nil),
        vistos: 52, total: 80, minutosRestantes: 3150,
        meta: .init(nombre: "Avengers: Doomsday", fecha: .now.addingTimeInterval(74 * 86400)), sesiones: [])
}

// MARK: Fondo

extension EnvironmentValues {
    /// La app dibuja estas vistas fuera de un widget, donde containerBackground no pinta nada
    @Entry var dibujoEnApp = false
}

extension View {
    func fondoWidget<F: View>(@ViewBuilder _ fondo: () -> F) -> some View { modifier(FondoWidget(fondo: fondo())) }
}

private struct FondoWidget<F: View>: ViewModifier {
    let fondo: F
    @Environment(\.dibujoEnApp) private var enApp
    func body(content: Content) -> some View {
        if enApp { content.background { fondo } } else { content.containerBackground(for: .widget) { fondo } }
    }
}
