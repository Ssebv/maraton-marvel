// El lector de cómics, como src/lector.js de la web: los archivos que TÚ
// tienes (CBZ/ZIP, PDF o las páginas como imágenes) se copian dentro de la app
// y se leen aquí; nada se sube ni se descarga. Los CBR de verdad (RAR) no se
// abren en iOS: no hay descompresor en el sistema. Los .cbr que por dentro
// son ZIP (pasa a menudo) sí.
import Compression
import Foundation
import Observation

public enum ErrorLector: Error, Equatable, Sendable {
    case rar, noEsZip, zip64, sinPaginas, cifrado, danado(pagina: Int), formato, vacio
}

// MARK: ZIP por trozos

/// Un CBZ leído POR TROZOS: el índice central (unos KB al final) se lee una vez
/// y cada página se corta y se infla sola. En memoria vive una página, no el
/// cómic. ZIP64 (>4 GB) no hace falta.
public struct ArchivoZip: Sendable {
    struct Entrada: Sendable { let nombre: String; let metodo: UInt16; let flags: UInt16; let comp: Int; let tam: Int; let local: Int }
    public let url: URL
    let paginas: [Entrada]
    public var total: Int { paginas.count }
    public var nombres: [String] { paginas.map(\.nombre) }

    public init(url: URL) throws {
        self.url = url
        let h = try FileHandle(forReadingFrom: url)
        defer { try? h.close() }
        let tam = Int(try h.seekToEnd())
        let firma = try Self.lee(h, 0, min(4, tam))
        if firma.starts(with: [0x52, 0x61, 0x72, 0x21]) { throw ErrorLector.rar }
        guard firma.starts(with: [0x50, 0x4b]) else { throw ErrorLector.noEsZip }
        let desde = max(0, tam - 66_000)
        let cola = try Self.lee(h, desde, tam - desde)
        guard cola.count >= 22, let fin = stride(from: cola.count - 22, through: 0, by: -1).first(where: {
            cola[$0] == 0x50 && cola[$0 + 1] == 0x4b && cola[$0 + 2] == 0x05 && cola[$0 + 3] == 0x06
        }) else { throw ErrorLector.noEsZip }
        let cdTam = Int(cola.u32(fin + 12)), cdOff = Int(cola.u32(fin + 16))
        if cdOff == 0xFFFF_FFFF { throw ErrorLector.zip64 }
        guard cdOff + cdTam <= tam else { throw ErrorLector.noEsZip }
        let cd = try Self.lee(h, cdOff, cdTam)
        var i = 0, todas: [Entrada] = []
        while i + 46 <= cd.count, cd.u32(i) == 0x0201_4b50 {
            let nl = Int(cd.u16(i + 28)), el = Int(cd.u16(i + 30)), cl = Int(cd.u16(i + 32))
            guard i + 46 + nl <= cd.count else { break }
            let flags = cd.u16(i + 8)
            let bytes = cd.subdata(in: i + 46 ..< i + 46 + nl)
            // bit 11: nombre en UTF-8; si no, CP437, que en lo que importa
            // (letras y números) coincide con Latin-1
            let nombre = String(data: bytes, encoding: flags & 0x800 != 0 ? .utf8 : .isoLatin1)
                ?? String(decoding: bytes, as: UTF8.self)
            todas.append(Entrada(nombre: nombre, metodo: cd.u16(i + 10), flags: flags, comp: Int(cd.u32(i + 20)),
                                 tam: Int(cd.u32(i + 24)), local: Int(cd.u32(i + 42))))
            i += 46 + nl + el + cl
        }
        paginas = todas.filter { Lector.esPagina($0.nombre) }
            .sorted { $0.nombre.localizedStandardCompare($1.nombre) == .orderedAscending }
        if paginas.isEmpty { throw ErrorLector.sinPaginas }
    }

    /// Los bytes de la página i (0 = portada)
    public func pagina(_ i: Int) throws -> Data {
        guard paginas.indices.contains(i) else { throw ErrorLector.danado(pagina: i) }
        let e = paginas[i]
        if e.flags & 1 != 0 { throw ErrorLector.cifrado }
        let h = try FileHandle(forReadingFrom: url)
        defer { try? h.close() }
        let cab = try Self.lee(h, e.local, 30)
        guard cab.count == 30, cab.u32(0) == 0x0403_4b50 else { throw ErrorLector.danado(pagina: i) }
        let datos = try Self.lee(h, e.local + 30 + Int(cab.u16(26)) + Int(cab.u16(28)), e.comp)
        guard datos.count == e.comp else { throw ErrorLector.danado(pagina: i) }
        switch e.metodo {
        case 0: return datos
        case 8:
            // tope de 200 MB por página: un índice falso no pide memoria sin fin
            guard e.comp > 0, e.tam > 0, e.tam < 200 << 20 else { throw ErrorLector.danado(pagina: i) }
            var salida = Data(count: e.tam)
            let n = salida.withUnsafeMutableBytes { dst in
                datos.withUnsafeBytes { src in
                    // COMPRESSION_ZLIB de Apple es DEFLATE crudo, lo que guarda un ZIP
                    compression_decode_buffer(dst.bindMemory(to: UInt8.self).baseAddress!, e.tam,
                                              src.bindMemory(to: UInt8.self).baseAddress!, e.comp, nil, COMPRESSION_ZLIB)
                }
            }
            guard n == e.tam else { throw ErrorLector.danado(pagina: i) }
            return salida
        default: throw ErrorLector.danado(pagina: i)
        }
    }

    static func lee(_ h: FileHandle, _ desde: Int, _ n: Int) throws -> Data {
        guard n > 0 else { return Data() }
        try h.seek(toOffset: UInt64(desde))
        return try h.read(upToCount: n) ?? Data()
    }
}

extension Data {
    func u16(_ i: Int) -> UInt16 { UInt16(self[startIndex + i]) | UInt16(self[startIndex + i + 1]) << 8 }
    func u32(_ i: Int) -> UInt32 { UInt32(u16(i)) | UInt32(u16(i + 2)) << 16 }
}

// MARK: Qué se puede leer

public enum Lector {
    static let imagenes: Set<String> = ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic"]
    /// Una imagen que no es basura del Mac (__MACOSX, ._archivo) ni oculta
    static func esPagina(_ nombre: String) -> Bool {
        let partes = nombre.split(separator: "/")
        guard let ultima = partes.last, !nombre.hasSuffix("/") else { return false }
        if partes.contains(where: { $0 == "__MACOSX" || $0.hasPrefix(".") }) { return false }
        return imagenes.contains((ultima as NSString).pathExtension.lowercased())
    }

    /// Lo que se abre: el ZIP, la lista de imágenes (en orden) o el PDF
    public enum Fuente: Sendable {
        case zip(ArchivoZip)
        case imagenes([URL])
        case pdf(URL)
    }
}

// MARK: Biblioteca

/// Un archivo guardado para un cómic del maratón
public struct ArchivoComic: Codable, Sendable, Hashable {
    public enum Tipo: String, Codable, Sendable { case zip, pdf, imagenes }
    public let tipo: Tipo
    /// Como lo llamaste (o «24 imágenes»)
    public let nombre: String
    public let tam: Int64
    public let fecha: Double
    /// Dentro de la carpeta de la biblioteca: «id.cbz» o «id/» con las páginas
    let ruta: String
}

/// Los archivos de cómic copiados dentro de la app, uno por título:
/// Application Support/Comics con un indice.json
@MainActor @Observable
public final class Biblioteca {
    public private(set) var archivos: [String: ArchivoComic] = [:]
    @ObservationIgnored let carpeta: URL

    public init(carpeta: URL? = Biblioteca.carpetaPorDefecto) {
        self.carpeta = carpeta ?? FileManager.default.temporaryDirectory.appendingPathComponent("Comics")
        if let d = try? Data(contentsOf: indice), let a = try? JSONDecoder().decode([String: ArchivoComic].self, from: d) {
            // el que falta en disco (borrado a mano, restaurado a medias) no se lista
            archivos = a.filter { FileManager.default.fileExists(atPath: self.carpeta.appendingPathComponent($0.value.ruta).path) }
        }
    }

    public nonisolated static var carpetaPorDefecto: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("Comics")
    }

    var indice: URL { carpeta.appendingPathComponent("indice.json") }
    public var total: Int64 { archivos.values.reduce(0) { $0 + $1.tam } }

    /// Guarda lo elegido (un archivo o varias imágenes) para el cómic `id`,
    /// en lugar del que tuviera. La copia va fuera del hilo principal (un CBZ
    /// puede pesar 300 MB) y antes se comprueba que se puede leer.
    @discardableResult
    public func guarda(_ urls: [URL], para id: String) async throws -> ArchivoComic {
        let carpeta = carpeta
        let nuevo = try await Task.detached(priority: .userInitiated) {
            try Self.copia(urls, id: id, en: carpeta)
        }.value
        if let viejo = archivos[id], viejo.ruta != nuevo.ruta {
            try? FileManager.default.removeItem(at: carpeta.appendingPathComponent(viejo.ruta))
        }
        archivos[id] = nuevo
        escribe()
        return nuevo
    }

    public func quita(_ id: String) {
        guard let a = archivos.removeValue(forKey: id) else { return }
        try? FileManager.default.removeItem(at: carpeta.appendingPathComponent(a.ruta))
        escribe()
    }

    /// Lo que hay que abrir para leer el cómic `id`
    public func fuente(_ id: String) throws -> Lector.Fuente {
        guard let a = archivos[id] else { throw ErrorLector.vacio }
        let url = carpeta.appendingPathComponent(a.ruta)
        switch a.tipo {
        case .zip: return .zip(try ArchivoZip(url: url))
        case .pdf: return .pdf(url)
        case .imagenes:
            let lista = (try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)) ?? []
            let pags = lista.filter { Lector.esPagina($0.lastPathComponent) }
                .sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
            if pags.isEmpty { throw ErrorLector.sinPaginas }
            return .imagenes(pags)
        }
    }

    func escribe() {
        do {
            try FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
            // fuera de la copia de iCloud: un CBZ pesa cientos de MB y el original sigue en Archivos
            var fuera = URLResourceValues()
            fuera.isExcludedFromBackup = true
            var c = carpeta
            try? c.setResourceValues(fuera)
            try JSONEncoder().encode(archivos).write(to: indice, options: .atomic)
        } catch {}
    }

    nonisolated static func copia(_ urls: [URL], id: String, en carpeta: URL) throws -> ArchivoComic {
        let fm = FileManager.default
        try fm.createDirectory(at: carpeta, withIntermediateDirectories: true)
        // los que vienen del selector de archivos piden permiso para leerse
        let accesos = urls.map { $0.startAccessingSecurityScopedResource() }
        defer { for (u, ok) in zip(urls, accesos) where ok { u.stopAccessingSecurityScopedResource() } }
        let ahora = (Date().timeIntervalSince1970 * 1000).rounded()
        let seguro = id.replacingOccurrences(of: "/", with: "-")
        // primero a un sitio temporal: si algo falla, el archivo anterior sigue
        let tmp = carpeta.appendingPathComponent(".nuevo-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: tmp) }

        guard let primera = urls.first else { throw ErrorLector.vacio }
        let ext = primera.pathExtension.lowercased()
        let tipo: ArchivoComic.Tipo
        let ruta: String
        var nombre = primera.lastPathComponent
        if urls.count == 1 && ext == "pdf" {
            tipo = .pdf; ruta = "\(seguro).pdf"
            try fm.copyItem(at: primera, to: tmp)
        } else if urls.count == 1 && ["cbz", "zip", "cbr", "rar"].contains(ext) {
            tipo = .zip; ruta = "\(seguro).cbz"
            try fm.copyItem(at: primera, to: tmp)
            _ = try ArchivoZip(url: tmp)  // un RAR o un ZIP sin páginas no se guarda
        } else {
            let pags = urls.filter { Lector.esPagina($0.lastPathComponent) }
                .sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
            if pags.isEmpty { throw urls.count == 1 ? ErrorLector.formato : ErrorLector.sinPaginas }
            tipo = .imagenes; ruta = "\(seguro)/"
            if pags.count > 1 { nombre = "\(pags.count)" }
            try fm.createDirectory(at: tmp, withIntermediateDirectories: true)
            // con su número delante: el orden no depende de cómo se llamaban
            for (i, u) in pags.enumerated() {
                try fm.copyItem(at: u, to: tmp.appendingPathComponent(String(format: "%04d.%@", i + 1, u.pathExtension.lowercased())))
            }
        }
        let destino = carpeta.appendingPathComponent(ruta)
        if fm.fileExists(atPath: destino.path) { try fm.removeItem(at: destino) }
        try fm.moveItem(at: tmp, to: destino)
        return ArchivoComic(tipo: tipo, nombre: nombre, tam: tamano(destino), fecha: ahora, ruta: ruta)
    }

    nonisolated static func tamano(_ url: URL) -> Int64 {
        let fm = FileManager.default
        var dir: ObjCBool = false
        guard fm.fileExists(atPath: url.path, isDirectory: &dir) else { return 0 }
        if !dir.boolValue { return (try? fm.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0 }
        return ((try? fm.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)) ?? []).reduce(0) { $0 + tamano($1) }
    }
}

// MARK: Por dónde vas

/// La página por la que vas de un cómic: p (0 = portada) de t, y cuándo
public struct Lectura: Codable, Sendable, Hashable {
    public let p: Int
    public let t: Int
    public var f: Double?

    public init(p: Int, t: Int, f: Double? = nil) { self.p = p; self.t = t; self.f = f }

    /// Las de la web (KEY_LECTOR), con las reglas de saneaLector
    static func sanea(_ x: Any?) -> [String: Lectura] {
        guard let d = x as? [String: Any] else { return [:] }
        var out: [String: Lectura] = [:]
        for (id, v) in d {
            guard let o = v as? [String: Any], let p = entero(o["p"]), let t = entero(o["t"]), p >= 0, t > 0 else { continue }
            out[id] = Lectura(p: min(p, t - 1), t: t, f: entero(o["f"]).map(Double.init))
        }
        return out
    }

    static func entero(_ x: Any?) -> Int? {
        guard let n = x as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
        let d = n.doubleValue
        return d.rounded() == d && abs(d) < 1e15 ? Int(d) : nil
    }
}
