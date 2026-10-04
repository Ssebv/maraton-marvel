#if DEBUG
// `simctl launch … -capturaWidget YES`: dibuja el widget en sus tamaños a PNG en
// Documents/widget-*.png. No hay app Simulator para añadirlo al escritorio.
import SwiftUI
import WidgetKit

enum CapturaWidget {
    @MainActor static func dibuja() {
        guard let foto = FotoWidget.lee(),
              let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let e = Entrada(date: .now, foto: foto)
        func png<V: View>(_ nombre: String, _ ancho: CGFloat, _ alto: CGFloat, radio: CGFloat, _ v: V) {
            let r = ImageRenderer(content: v
                .frame(width: ancho, height: alto)
                .clipShape(.rect(cornerRadius: radio))
                .environment(\.dibujoEnApp, true)
                .environment(\.colorScheme, .dark)
                .padding(12)
                .background(Color(white: 0.35)))
            r.scale = 3
            try? r.uiImage?.pngData()?.write(to: docs.appendingPathComponent("widget-\(nombre).png"))
        }
        // tamaños del iPhone 17 Pro (puntos)
        png("pequeno", 170, 170, radio: 22, Pequeno(entrada: e))
        png("mediano", 364, 170, radio: 22, Mediano(entrada: e))
        png("circular", 72, 72, radio: 36, Circular(entrada: e).foregroundStyle(.white))
        png("rectangular", 172, 76, radio: 0, Rectangular(entrada: e).foregroundStyle(.white))
        png("linea", 260, 22, radio: 0, EnLinea(entrada: e).foregroundStyle(.white))
    }
}
#endif
