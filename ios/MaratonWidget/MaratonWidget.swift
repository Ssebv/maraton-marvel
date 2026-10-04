// Widget «Tu maratón»: el siguiente título con su póster, el avance y la
// cuenta atrás al estreno (o la próxima sesión del horario). Lee la foto que
// escribe la app (Compartido/FotoWidget.swift); tocarlo abre la ficha. Las
// vistas están en Compartido/VistasWidget.swift (la app las dibuja en depuración).
import SwiftUI
import WidgetKit

@main
struct MaratonWidgets: WidgetBundle {
    var body: some Widget { SiguienteWidget() }
}

struct SiguienteWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: FotoWidget.tipoWidget, provider: Proveedor()) { e in
            VistaWidget(entrada: e)
        }
        .configurationDisplayName("Tu maratón")
        .description("El siguiente título, tu avance y la cuenta atrás al estreno.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
        .contentMarginsDisabled()
    }
}

struct Proveedor: TimelineProvider {
    func placeholder(in context: Context) -> Entrada { Entrada(date: .now, foto: .ejemplo) }

    func getSnapshot(in context: Context, completion: @escaping (Entrada) -> Void) {
        completion(Entrada(date: .now, foto: FotoWidget.lee() ?? .ejemplo))
    }

    /// Una entrada ahora, otra cada medianoche (la cuenta atrás) y otra al
    /// empezar cada sesión (pasa a la siguiente). La app pide redibujar al marcar.
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entrada>) -> Void) {
        let foto = FotoWidget.lee()
        let cal = Calendar.current
        let ahora = Date.now
        var fechas: [Date] = [ahora]
        var dia = cal.startOfDay(for: ahora)
        for _ in 0..<7 {
            dia = cal.date(byAdding: .day, value: 1, to: dia) ?? dia
            fechas.append(dia)
        }
        fechas += (foto?.sesiones ?? []).map { $0.fecha.addingTimeInterval(1) }.filter { $0 > ahora && $0 <= dia }
        let entradas = Set(fechas).sorted().map { Entrada(date: $0, foto: foto) }
        completion(Timeline(entries: entradas, policy: .after(dia)))
    }
}

