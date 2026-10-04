// Las noticias de Marvel de la web: public/noticias.json, que la tarea diaria
// (scripts/noticias.mjs) rellena con titular, medio, fecha, enlace e imagen.
import Foundation

public struct Noticia: Sendable, Hashable, Identifiable {
    public let titular: String
    public let url: URL
    public let medio: String?
    public let fecha: Date?
    /// Relativa a la web («noticias/<16 hex>.webp»)
    public let imagen: String?
    public var id: URL { url }
}

public enum Noticias {
    /// Donde la publica GitHub Pages
    public static let base = URL(string: "https://ssebv.github.io/maraton-marvel/")!
    public static let fichero = base.appending(path: "noticias.json")

    /// Lee el JSON con las reglas de la web: solo enlaces https y la imagen
    /// solo si tiene la forma que escribe el script. Los dos idiomas.
    public static func lee(_ datos: Data) -> (es: [Noticia], en: [Noticia])? {
        guard let j = try? JSONSerialization.jsonObject(with: datos) as? [String: Any] else { return nil }
        func lista(_ v: Any?) -> [Noticia] {
            (v as? [[String: Any]] ?? []).compactMap { n in
                guard let t = n["t"] as? String, !t.isEmpty,
                      let s = n["url"] as? String, s.hasPrefix("https://"), let url = URL(string: s) else { return nil }
                let img = (n["img"] as? String).flatMap { $0.wholeMatch(of: #/noticias\/[0-9a-f]{16}\.webp/#) != nil ? $0 : nil }
                let f = (n["f"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) }
                return Noticia(titular: t, url: url, medio: n["medio"] as? String, fecha: f, imagen: img)
            }
        }
        return (lista(j["es"]), lista(j["en"]))
    }

    public static func urlImagen(_ n: Noticia) -> URL? { n.imagen.map { base.appending(path: $0) } }
}
