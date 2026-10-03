// El progreso en un mapa de bits en base64url: lo mismo que aBits/deBits de
// src/App.jsx. Cada título o episodio ocupa la posición fija que le da el
// orden congelado (src/orden.js), así que un enlace hecho en la web se lee
// igual aquí y al revés.
import Foundation

public enum Bits {
    public static func codifica(_ marcadas: Set<String>, orden: [String]) -> String {
        var bytes = [UInt8](repeating: 0, count: (orden.count + 7) / 8)
        for (i, clave) in orden.enumerated() where marcadas.contains(clave) {
            bytes[i >> 3] |= 1 << (i & 7)
        }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Un texto mal formado da un conjunto vacío, como en la web
    public static func decodifica(_ b64: String, orden: [String]) -> Set<String> {
        var s = b64.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        s += String(repeating: "=", count: (4 - s.count % 4) % 4)
        guard let datos = Data(base64Encoded: s) else { return [] }
        let bytes = [UInt8](datos)
        var set = Set<String>()
        for (i, clave) in orden.enumerated() where (i >> 3) < bytes.count && bytes[i >> 3] & (1 << (i & 7)) != 0 {
            set.insert(clave)
        }
        return set
    }
}
