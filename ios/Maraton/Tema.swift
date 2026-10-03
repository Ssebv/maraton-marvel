// Estilo Norte con los colores de la web (:root de src/styles.css), claro y
// oscuro. Letra del sistema, superficies con filo, brillo y sombra, r-xl 24.
// Sin degradados de texto ni emoji en controles (nada-de-estetica-ia).
import SwiftUI
import UIKit

enum Tema {
    static let fondo = dinamico(claro: 0xF3EDDE, oscuro: 0x0A0C14)
    static let panel = dinamico(claro: 0xFCF8EC, oscuro: 0x131725)
    static let panel2 = dinamico(claro: 0xEAE2CC, oscuro: 0x1C2133)
    static let tinta = dinamico(claro: 0x191521, oscuro: 0xF2EFE6)
    static let tinta2 = dinamico(claro: 0x484336, oscuro: 0xA39F92)
    static let tinta3 = dinamico(claro: 0x6A6554, oscuro: 0x8D8A7E)
    static let linea = dinamico(claro: 0xD8CFB4, oscuro: 0x262B3E)
    static let rojo = dinamico(claro: 0xC8102E, oscuro: 0xF84A54)
    static let oro = dinamico(claro: 0x9E6C11, oscuro: 0xE8A93C)
    static let azul = dinamico(claro: 0x2B5DA8, oscuro: 0x7BA6E4)

    // --r-s, --r-m, --r-l, --r-xl
    static let radioS: CGFloat = 4
    static let radioM: CGFloat = 12
    static let radioL: CGFloat = 16
    static let radioXL: CGFloat = 24

    /// El color de cada saga (el acento de su universo en la web)
    static func color(saga: String?) -> Color {
        switch saga {
        case "xmen": oro
        case "ucm": rojo
        case "animacion": azul
        default: tinta2
        }
    }

    static func dinamico(claro: UInt32, oscuro: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: oscuro) : UIColor(hex: claro) })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

extension Color {
    /// «#E8A93C» de data.js (colores de las eras)
    init?(hex: String?) {
        guard let hex, hex.hasPrefix("#"), let n = UInt32(hex.dropFirst(), radix: 16) else { return nil }
        self.init(uiColor: UIColor(hex: n))
    }
}

/// Superficie Norte: panel con filo, brillo arriba y sombra suave
struct Superficie: ViewModifier {
    var radio: CGFloat = Tema.radioXL
    func body(content: Content) -> some View {
        content
            .background(Tema.panel, in: .rect(cornerRadius: radio))
            .overlay {
                RoundedRectangle(cornerRadius: radio)
                    .strokeBorder(LinearGradient(colors: [.white.opacity(0.55), Tema.linea.opacity(0.6)],
                                                 startPoint: .top, endPoint: .bottom), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
            .shadow(color: .black.opacity(0.07), radius: 15, y: 10)
    }
}

extension View {
    func superficie(radio: CGFloat = Tema.radioXL) -> some View { modifier(Superficie(radio: radio)) }
}
