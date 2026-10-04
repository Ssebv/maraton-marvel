// Escribe la foto que lee el widget (Compartido/FotoWidget.swift) y le pide a
// iOS que lo redibuje, solo si cambió algo: recargar timelines tiene cupo.
import Foundation
import WidgetKit
import MaratonKit

enum PuenteWidget {
    @MainActor static func publica(progreso: Progreso, ajustes: Ajustes, agenda: Agenda) {
        let catalogo = progreso.catalogo
        let r = progreso.resumen
        var foto = FotoWidget(en: ajustes.idioma == .en,
                              siguiente: progreso.siguiente().map { siguiente($0, progreso: progreso, ajustes: ajustes) },
                              vistos: r.vistos, total: r.total, minutosRestantes: r.minutosRestantes,
                              meta: catalogo.estrenoObjetivo().map { .init(nombre: $0.estreno.t, fecha: $0.fecha) },
                              sesiones: [])
        if let h = agenda.horario {
            foto.sesiones = progreso.simula(h, detalladas: 8).sesiones.compactMap { s in
                // la fecha de la sesión es su día; el aviso y el widget quieren la hora
                s.trozos.first.map { .init(fecha: h.inicio(el: s.fecha, .current), que: catalogo.nombre($0.titulo, en: ajustes.idioma)) }
            }
        }
        if foto.guarda() { WidgetCenter.shared.reloadTimelines(ofKind: FotoWidget.tipoWidget) }
    }

    @MainActor private static func siguiente(_ t: Titulo, progreso: Progreso, ajustes: Ajustes) -> FotoWidget.Siguiente {
        let c = progreso.catalogo
        let saga = c.saga(de: t.id)
        let pos = c.posicionEnSaga(t.id).map { " · \($0.posicion) / \($0.total)" } ?? ""
        let nombreSaga = saga == "xmen" ? "X-Men" : ajustes.tr("UCM", "MCU")
        var detalle = Formato.meta(t, catalogo: c)
        if t.esSerie {
            let (v, n) = progreso.vistosDe(serie: t.id)
            if v > 0 { detalle = ajustes.tr("\(v) de \(n) episodios", "\(v) of \(n) episodes") }
        }
        // relativo al paquete: su ruta absoluta cambia con cada instalación
        let app = Bundle.main.bundleURL.standardizedFileURL.path + "/"
        let poster = c.urlPoster(t.id, idioma: ajustes.idioma)?.standardizedFileURL.path
        return .init(id: t.id, nombre: c.nombre(t, en: ajustes.idioma), detalle: detalle,
                     rotulo: ajustes.tr("Siguiente en \(nombreSaga)\(pos)", "Next in \(nombreSaga)\(pos)"), saga: saga,
                     poster: poster.flatMap { $0.hasPrefix(app) ? String($0.dropFirst(app.count)) : nil })
    }
}
