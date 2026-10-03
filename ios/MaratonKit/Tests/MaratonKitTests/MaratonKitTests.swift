import Foundation
import Testing
@testable import MaratonKit

// Los datos los genera `npm run ios:datos` (o `npm run ios:test`, que lo hace antes)
let catalogo: Catalogo = {
    do { return try Catalogo.cargar() } catch { fatalError("\(error)") }
}()

struct Vectores: Decodable {
    struct Caso: Decodable { let nombre: String; let claves: [String]; let b64: String }
    let ids: [Caso]
    let eps: [Caso]
}

let vectores: Vectores = {
    let url = Bundle.module.url(forResource: "vectores", withExtension: "json")!
    return try! JSONDecoder().decode(Vectores.self, from: Data(contentsOf: url))
}()

@Suite("Catálogo")
struct PruebasCatalogo {
    @Test func cargaTodo() {
        #expect(catalogo.sagas.map(\.saga) == ["xmen", "ucm", "comics", "animacion"])
        #expect(catalogo.titulos.count == 156)
        #expect(Set(catalogo.titulos.map(\.id)).count == catalogo.titulos.count, "ids repetidos")
        #expect(!catalogo.estrenos.isEmpty && !catalogo.multiverso.isEmpty)
    }

    @Test func elMaratonNoIncluyeComicsNiAnimacion() {
        #expect(catalogo.titulos.allSatisfy { t in
            catalogo.idsMaraton.contains(t.id) == !["comics", "animacion"].contains(catalogo.saga(de: t.id))
        })
    }

    @Test func cadaBitTieneTituloOEsUnLote() {
        for id in catalogo.ordenIds {
            #expect(catalogo.titulo(id) != nil || catalogo.lotes[id] != nil, "bit huérfano: \(id)")
        }
        #expect(catalogo.ordenIds.count >= catalogo.titulos.count)
    }

    @Test func episodiosYTemporadas() throws {
        let tas = catalogo.temporadas(de: "xmen-tas")
        #expect(tas.first?.numero == 1)
        #expect(tas.first?.episodios.first?.t == "La noche de los centinelas (Parte 1)")
        let total = catalogo.episodios.values.reduce(0) { $0 + $1.count }
        #expect(catalogo.ordenEps.count == total)
    }

    @Test func idiomas() throws {
        let fc = try #require(catalogo.titulo("first-class"))
        #expect(catalogo.nombre(fc, en: .en) == "X-Men: First Class")
        let ow = try #require(catalogo.titulo("origins-wolverine"))
        #expect(catalogo.nombre(ow, en: .latam) == "X-Men orígenes: Wolverine")
        #expect(catalogo.nombre(ow, en: .es) == "X-Men Orígenes: Lobezno")
        let ep = try #require(catalogo.episodios(de: "xmen-tas").first)
        #expect(catalogo.nombre(ep, de: "xmen-tas", en: .en) == "Night of the Sentinels (1)")
        #expect(catalogo.texto(fc.res, en: .en) != fc.res)
    }

    @Test func detallesYPlataformas() throws {
        let d = try #require(catalogo.detalle("first-class", en: .es))
        #expect(d.larga?.hasPrefix("En 1962") == true)
        #expect(catalogo.detalle("first-class", en: .en)?.larga != nil)
        let fc = try #require(catalogo.titulo("first-class"))
        #expect(catalogo.plataforma(fc, pais: "ES") == "Disney+")
        #expect(catalogo.plataforma(fc, pais: "CL") != nil)
    }

    @Test func imagenesEnElPaquete() throws {
        for t in catalogo.titulos {
            for idioma in Idioma.allCases {
                guard let url = catalogo.urlPoster(t.id, idioma: idioma) else { continue }
                #expect(FileManager.default.fileExists(atPath: url.path), "falta el póster de \(t.id) (\(idioma))")
            }
        }
        let foto = try #require(catalogo.urlFoto(persona: "Hugh Jackman"))
        #expect(FileManager.default.fileExists(atPath: foto.path))
    }

    @Test(arguments: [
        ("lobezno", "origins-wolverine"),
        ("spiderman", "sm-raimi1"),
        ("JACKMAN", "xmen1"),
        ("primera generacion", "first-class"),
        ("First Class", "first-class"),
        ("noche de los centinelas", "xmen-tas"),
        ("Night of the Sentinels", "xmen-tas"),
        ("Gavin Hood", "origins-wolverine"),
    ])
    func buscar(consulta: String, espera: String) {
        #expect(catalogo.buscar(consulta).contains { $0.id == espera }, "«\(consulta)» no encuentra \(espera)")
    }

    @Test func fondosYEstrenos() throws {
        #expect(catalogo.urlFondo(saga: "ucm") != nil)
        #expect(catalogo.urlFotograma("first-class")?.absoluteString.hasPrefix("https://image.tmdb.org/t/p/w780/") == true)
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX")
        let (e, dias) = try #require(catalogo.proximoEstreno(hoy: f.date(from: "2026-12-01")!))
        #expect(e.id == "doomsday" && dias == 17)
        #expect(catalogo.urlLocal(e.img) != nil, "su fondo va en el paquete")
        #expect(catalogo.proximoEstreno(hoy: f.date(from: "2099-01-01")!) == nil)
    }

    @Test func posicionEnSaga() throws {
        let p = try #require(catalogo.posicionEnSaga("first-class"))
        #expect(p.posicion == 1)
        #expect(catalogo.posicionEnSaga("origins-wolverine")?.posicion == 2)
        #expect(p.total == catalogo.titulos.filter { catalogo.saga(de: $0.id) == "xmen" }.count)
        #expect(catalogo.posicionEnSaga("c-giantsize") == nil, "los cómics no están en el maratón")
    }

    @Test func buscarVacioNoDevuelveNada() {
        #expect(catalogo.buscar("  ").isEmpty)
    }
}

@Suite("Bits compatibles con la web")
struct PruebasBits {
    @Test func codificaIgualQueLaWeb() {
        for c in vectores.ids {
            #expect(Bits.codifica(Set(c.claves), orden: catalogo.ordenIds) == c.b64, "\(c.nombre)")
        }
        for c in vectores.eps {
            #expect(Bits.codifica(Set(c.claves), orden: catalogo.ordenEps) == c.b64, "\(c.nombre)")
        }
    }

    @Test func decodificaIgualQueLaWeb() {
        for c in vectores.ids {
            #expect(Bits.decodifica(c.b64, orden: catalogo.ordenIds) == Set(c.claves), "\(c.nombre)")
        }
        for c in vectores.eps {
            #expect(Bits.decodifica(c.b64, orden: catalogo.ordenEps) == Set(c.claves), "\(c.nombre)")
        }
    }

    @Test func textoMaloEsVacio() {
        #expect(Bits.decodifica("%%%", orden: catalogo.ordenIds).isEmpty)
        #expect(Bits.decodifica("", orden: catalogo.ordenIds).isEmpty)
    }
}

@Suite("Progreso")
@MainActor
struct PruebasProgreso {
    @Test func marcarYResumen() {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        #expect(p.resumen.vistos == 0)
        #expect(p.siguiente()?.id == catalogo.titulos.first?.id)
        p.alternar("first-class")
        #expect(p.visto("first-class"))
        #expect(p.resumen.vistos == 1)
        #expect(p.resumen.minutosVistos == 132)
        #expect(p.siguiente()?.id != "first-class")
        p.alternar("first-class")
        #expect(!p.visto("first-class"))
    }

    @Test func todoVistoEsCienPorCiento() {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        catalogo.titulos.forEach { p.alternar($0.id) }
        #expect(p.resumen.fraccion == 1)
        #expect(p.resumen.minutosRestantes == 0)
        #expect(p.siguiente() == nil)
    }

    @Test func serieCompletaQuedaVista() throws {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let serie = try #require(catalogo.titulos.first { $0.esSerie && !catalogo.episodios(de: $0.id).isEmpty && catalogo.idsMaraton.contains($0.id) })
        let lista = catalogo.episodios(de: serie.id)
        lista.dropLast().forEach { p.alternar($0, de: serie.id) }
        #expect(!p.visto(serie.id))
        #expect(p.resumen.minutosVistos > 0, "la parte vista de la serie cuenta")
        p.alternar(lista.last!, de: serie.id)
        #expect(p.visto(serie.id))
        #expect(p.vistosDe(serie: serie.id) == (lista.count, lista.count))
    }

    @Test func importaSinBorrarYMigraLotes() throws {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        p.alternar("xmen1")
        let (lote, piezas) = try #require(catalogo.lotes.first { catalogo.ordenIds.contains($0.key) })
        let v = Bits.codifica([lote, "x2"], orden: catalogo.ordenIds)
        let e = Bits.codifica(Set(catalogo.ordenEps.prefix(3)), orden: catalogo.ordenEps)
        let r = p.importa(v: v, e: e)
        #expect(p.visto("xmen1") && p.visto("x2"))
        #expect(piezas.allSatisfy { p.visto($0) })
        #expect(!p.visto(lote))
        #expect(r.titulos == piezas.count + 1)
        #expect(r.episodios == 3)
        #expect(p.importa(v: v, e: e) == (0, 0), "importar dos veces no suma nada")
    }

    @Test func idaYVuelta() {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        ["first-class", "xmen1", "logan"].forEach { p.alternar($0) }
        let (v, e) = p.exporta()
        let q = Progreso(catalogo: catalogo, archivo: nil)
        q.importa(v: v, e: e)
        #expect(Set(q.vistas.keys) == Set(p.vistas.keys))
    }

    @Test func guardaYRecupera() throws {
        let archivo = FileManager.default.temporaryDirectory
            .appendingPathComponent("maraton-\(UUID().uuidString)/progreso.json")
        defer { try? FileManager.default.removeItem(at: archivo.deletingLastPathComponent()) }
        let p = Progreso(catalogo: catalogo, archivo: archivo)
        p.alternar("logan")
        let q = Progreso(catalogo: catalogo, archivo: archivo)
        #expect(q.visto("logan"))
    }

    @Test func unArchivoIlegibleSeApartaEnVezDeBorrarse() throws {
        let carpeta = FileManager.default.temporaryDirectory.appendingPathComponent("maraton-\(UUID().uuidString)")
        let archivo = carpeta.appendingPathComponent("progreso.json")
        defer { try? FileManager.default.removeItem(at: carpeta) }
        try FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        try Data("{\"v\":{\"logan\":\"ayer\"}}".utf8).write(to: archivo)
        let p = Progreso(catalogo: catalogo, archivo: archivo)
        #expect(p.resumen.vistos == 0)
        p.alternar("xmen1")
        let nombres = try FileManager.default.contentsOfDirectory(atPath: carpeta.path)
        #expect(nombres.contains { $0.hasPrefix("progreso.respaldo-") }, "el archivo viejo se conserva")
        #expect(Progreso(catalogo: catalogo, archivo: archivo).visto("xmen1"))
    }

    @Test func importaElCodigoDeLaWeb() throws {
        // como exportar() de la web: btoa(unescape(encodeURIComponent(JSON.stringify(datos))))
        let json = #"{"v":{"logan":1727000000000,"sony":1727000000001},"e":{"xmen97:1:1":1727000000002,"no:9:9":1},"n":{"logan":"¡Qué final!"},"l":[]}"#
        let codigo = Data(json.utf8).base64EncodedString()
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let r = try #require(p.importa(codigoWeb: codigo))
        #expect(p.vistas["logan"] == 1727000000000, "conserva el momento")
        #expect(p.visto("venom1"), "el lote sony se reparte")
        #expect(p.eps["xmen97:1:1"] != nil && p.eps["no:9:9"] == nil)
        #expect(r.episodios == 1)
        #expect(p.importa(codigoWeb: "hola") == nil)
        #expect(p.importa(codigoWeb: Data(#"{"x":1}"#.utf8).base64EncodedString()) == nil)
    }
}
