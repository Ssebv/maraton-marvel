// Lo que el widget necesita saber, escrito por la app en un grupo del llavero
// que comparten los dos. No va en un App Group: la cuenta gratis de Apple no
// deja registrarlo desde la terminal, y el llavero del equipo (TEAM.*) viene en
// todos los perfiles. El widget no carga el catálogo (MaratonKit y sus 500
// imágenes pesarían el doble): lee esta foto y el póster del paquete de la app.
import Foundation
import Security

struct FotoWidget: Codable, Equatable {
    struct Siguiente: Codable, Equatable {
        let id: String
        let nombre: String
        /// «2008 · 2 h 6 min» o «Serie · 3 de 9 episodios»
        let detalle: String
        /// «Siguiente en UCM · 4 / 31»
        let rotulo: String
        /// xmen, ucm…: el color del acento
        let saga: String?
        /// El póster dentro del paquete de la app («MaratonKit_MaratonKit.bundle/…/x.webp»)
        let poster: String?
    }
    struct Meta: Codable, Equatable {
        let nombre: String
        /// Medianoche local del estreno
        let fecha: Date
    }
    struct Sesion: Codable, Equatable {
        let fecha: Date
        let que: String
    }

    var en: Bool
    var siguiente: Siguiente?
    var vistos: Int
    var total: Int
    var minutosRestantes: Int
    var meta: Meta?
    /// Las próximas sesiones del horario (el widget enseña la primera que no ha pasado)
    var sesiones: [Sesion]

    var fraccion: Double { total == 0 ? 0 : Double(vistos) / Double(total) }
    func tr(_ es: String, _ en: String) -> String { self.en ? en : es }

    static let tipoWidget = "MaratonSiguiente"

    /// «C8562562YC.com.ssebv.maraton.compartido»: el Info.plist lo trae con el prefijo del equipo
    static var grupoLlavero: String? { Bundle.main.object(forInfoDictionaryKey: "GrupoLlavero") as? String }

    private static func consulta() -> [String: Any]? {
        guard let g = grupoLlavero, !g.hasPrefix("$") else { return nil }
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "widget",
                kSecAttrAccount as String: "foto", kSecAttrAccessGroup as String: g]
    }

    static func lee() -> FotoWidget? {
        guard var q = consulta() else { return nil }
        q[kSecReturnData as String] = true
        var r: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &r) == errSecSuccess, let datos = r as? Data else { return nil }
        let d = JSONDecoder()
        d.dateDecodingStrategy = .secondsSince1970
        return try? d.decode(FotoWidget.self, from: datos)
    }

    /// Guarda si cambió; true = hay que pedirle a iOS que redibuje el widget
    func guarda() -> Bool {
        guard let q = FotoWidget.consulta(), let nuevos = datos() else { return false }
        var l = q
        l[kSecReturnData as String] = true
        var r: CFTypeRef?
        if SecItemCopyMatching(l as CFDictionary, &r) == errSecSuccess {
            if (r as? Data) == nuevos { return false }
            return SecItemUpdate(q as CFDictionary, [kSecValueData as String: nuevos] as CFDictionary) == errSecSuccess
        }
        var nuevo = q
        nuevo[kSecValueData as String] = nuevos
        // el widget también se dibuja con el iPhone bloqueado
        nuevo[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(nuevo as CFDictionary, nil) == errSecSuccess
    }

    func datos() -> Data? {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .secondsSince1970
        e.outputFormatting = .sortedKeys
        return try? e.encode(self)
    }
}
