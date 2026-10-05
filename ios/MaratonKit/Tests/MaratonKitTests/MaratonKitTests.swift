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
    let horario: [CasoHorario]
    struct CasoHorario: Decodable {
        struct Sesion: Decodable { let min: Int; let trozos: [[String]] }
        let nombre: String
        let h: Horario
        let vistas: [String]
        let eps: [String]
        let totalMin: Int
        let nSesiones: Int
        let seAcaba: Bool
        let sesiones: [Sesion]
    }
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

    @Test func vecinosEnSaga() throws {
        let v = catalogo.vecinosEnSaga("origins-wolverine")
        #expect(v.anterior?.id == "first-class" && v.siguiente?.id == "xmen1")
        #expect(catalogo.vecinosEnSaga("first-class").anterior == nil, "la primera no tiene anterior")
        let ultimo = try #require(catalogo.titulos.last { catalogo.saga(de: $0.id) == "xmen" && catalogo.idsMaraton.contains($0.id) })
        #expect(catalogo.vecinosEnSaga(ultimo.id).siguiente == nil, "la última no tiene siguiente")
        let c = catalogo.vecinosEnSaga("c-giantsize")
        #expect(c.anterior == nil && c.siguiente == nil, "los cómics no están en el maratón")
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
        #expect(p.importa(v: v, e: e) == .init(titulos: 0, episodios: 0), "importar dos veces no suma nada")
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
        #expect(r.notas == 0 && p.notas.isEmpty, "una nota que no es objeto se ignora, como saneaNotas")
        #expect(p.importa(codigoWeb: "hola") == nil)
        #expect(p.importa(codigoWeb: Data(#"{"x":1}"#.utf8).base64EncodedString()) == nil)
    }
}

@Suite("Estrenos y logros")
@MainActor
struct PruebasEstrenosLogros {
    @Test func estrenosPendientes() {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX")
        let lista = catalogo.estrenosPendientes(hoy: f.date(from: "2026-10-03")!)
        let dias = lista.compactMap(\.dias)
        #expect(dias == dias.sorted() && dias.first == 11, "Vision Quest el 14 de octubre")
        #expect(lista.last?.dias == nil, "los aproximados al final")
        #expect(lista.allSatisfy { catalogo.urlImagen(estreno: $0.estreno) != nil || $0.estreno.fecha == nil })
        #expect(catalogo.texto(lista.first?.estreno.n, en: .en) != lista.first?.estreno.n, "su nota tiene inglés")
    }

    @Test func logrosConIdsQueExisten() {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let logros = p.logros()
        #expect(logros.count == 29 && Set(logros.map(\.id)).count == 29)
        #expect(logros.allSatisfy { !$0.conseguido }, "sin marcas no hay ninguno")
        for l in logros {
            #expect(GrupoLogro.todos.contains { $0.id == l.grupo })
            #expect(l.avance.map { $0.meta > 0 } ?? true, "\(l.id) cuenta contra un total vacío: falta un id")
            #expect(catalogo.texto(l.titulo, en: .en) != l.titulo, "\(l.id) sin inglés")
        }
    }

    @Test func logrosPorIdsYHabitos() throws {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "America/Santiago")!
        let base = cal.date(from: DateComponents(year: 2026, month: 9, day: 1, hour: 21))!.timeIntervalSince1970 * 1000
        // Logan los tres en días seguidos y Capi el mismo día que el último
        let marcas: [String: Double] = ["origins-wolverine": base, "the-wolverine": base + 864e5, "logan": base + 2 * 864e5,
                                        "cap1": base + 2 * 864e5, "cap2": base + 2 * 864e5 + 60_000]
        _ = p.suma(marcas, [:])
        let l = Dictionary(uniqueKeysWithValues: p.logros(calendario: cal).map { ($0.id, $0) })
        #expect(l["primero"]?.conseguido == true)
        #expect(l["logan"]?.conseguido == true)
        #expect(l["capi"]?.avance == Logro.Avance(hecho: 2, meta: 3))
        #expect(l["racha"]?.avance == Logro.Avance(hecho: 3, meta: 7))
        #expect(l["maraton-dia"]?.avance == Logro.Avance(hecho: 3, meta: 5))
        // la racha no se corta el 6 de septiembre (en Chile no existe esa medianoche)
        let r = Progreso(catalogo: catalogo, archivo: nil)
        let dia1 = cal.date(from: DateComponents(year: 2026, month: 9, day: 3, hour: 20))!.timeIntervalSince1970 * 1000
        let ids = catalogo.titulos.prefix(8).map(\.id)
        _ = r.suma(Dictionary(uniqueKeysWithValues: ids.enumerated().map { ($1, dia1 + Double($0) * 864e5) }), [:])
        #expect(r.logros(calendario: cal).first { $0.id == "racha" }?.conseguido == true)
        // las marcas por bits no tienen fecha: no cuentan para hábitos
        let q = Progreso(catalogo: catalogo, archivo: nil)
        _ = q.suma(["logan": 1, "cap1": 1], [:])
        #expect(q.logros().first { $0.id == "racha" }?.avance?.hecho == 0)
    }
}

@Suite("Notas y reseñas")
@MainActor
struct PruebasNotas {
    @Test func estrellasYTexto() {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        p.ponEstrellas(4, a: "logan")
        #expect(p.nota("logan").p == 4)
        p.ponEstrellas(4, a: "logan")
        #expect(p.notas["logan"] == nil, "tocar la misma estrella la quita y sin nada no queda la nota")
        p.ponEstrellas(9, a: "logan")
        #expect(p.notas["logan"] == nil)
        p.ponTexto(String(repeating: "a", count: 400), a: "logan")
        #expect(p.nota("logan").txt?.count == Nota.largoMaximo)
        p.ponTexto("   ", a: "cap1")
        #expect(p.notas["cap1"] != nil && !p.nota("cap1").tieneResena, "solo espacios no es reseña")
        p.ponTexto("", a: "cap1")
        #expect(p.notas["cap1"] == nil)
    }

    @Test func seGuardanYLosArchivosViejosSiguenLeyendose() throws {
        let carpeta = FileManager.default.temporaryDirectory.appendingPathComponent("maraton-\(UUID().uuidString)")
        let archivo = carpeta.appendingPathComponent("progreso.json")
        defer { try? FileManager.default.removeItem(at: carpeta) }
        try FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
        try Data(#"{"v":{"logan":1727000000000},"e":{}}"#.utf8).write(to: archivo)
        let p = Progreso(catalogo: catalogo, archivo: archivo)
        #expect(p.visto("logan") && p.notas.isEmpty, "un progreso.json sin notas se lee igual")
        p.ponEstrellas(5, a: "logan")
        p.ponTexto("¡Qué final!", a: "logan")
        let q = Progreso(catalogo: catalogo, archivo: archivo)
        #expect(q.nota("logan") == Nota(p: 5, txt: "¡Qué final!") && q.visto("logan"))
    }

    @Test func importaLasNotasDeLaWebSinPisar() throws {
        let json = #"{"v":{},"e":{},"n":{"logan":{"p":5,"txt":"Brutal"},"cap1":{"p":3},"sony":{"p":4},"x2":{"p":9,"txt":7},"no-existe":{"p":2}}}"#
        let p = Progreso(catalogo: catalogo, archivo: nil)
        p.ponEstrellas(2, a: "cap1")
        let r = try #require(p.importa(codigoWeb: Data(json.utf8).base64EncodedString()))
        #expect(p.nota("logan") == Nota(p: 5, txt: "Brutal"))
        #expect(p.nota("cap1").p == 2, "la nota de aquí no se pisa")
        let primera = try #require(catalogo.lotes["sony"]?.first)
        #expect(p.nota(primera).p == 4 && p.notas["sony"] == nil, "la del lote pasa a su primera pieza")
        #expect(p.notas["x2"] == nil && p.notas["no-existe"] == nil, "fuera de rango o sin título no entra")
        #expect(r.notas == 2)
        // una reseña larga de la web no se corta al retocarla aquí
        let larga = String(repeating: "x", count: 1000)
        let q = Progreso(catalogo: catalogo, archivo: nil)
        _ = q.importa(codigoWeb: Data(#"{"v":{},"n":{"logan":{"txt":"\#(larga)"}}}"#.utf8).base64EncodedString())
        q.ponTexto(larga + "y", a: "logan")
        #expect(q.nota("logan").txt?.count == 1000)
        q.ponTexto(String(larga.prefix(500)), a: "logan")
        #expect(q.nota("logan").txt?.count == 500)
    }

    @Test func logrosDeNotas() {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let ids = catalogo.titulos.prefix(10).map(\.id)
        ids.prefix(9).forEach { p.ponEstrellas(3, a: $0) }
        ["a", "b"].enumerated().forEach { p.ponTexto($1, a: ids[$0]) }
        var l = Dictionary(uniqueKeysWithValues: p.logros().map { ($0.id, $0) })
        #expect(l["critico"]?.conseguido == false && l["critico"]?.avance?.hecho == 9)
        #expect(l["resenas"]?.avance?.hecho == 2)
        p.ponEstrellas(1, a: ids[9]); p.ponTexto("c", a: ids[2])
        l = Dictionary(uniqueKeysWithValues: p.logros().map { ($0.id, $0) })
        #expect(l["critico"]?.conseguido == true && l["resenas"]?.conseguido == true)
    }
}

@Suite("Estadísticas")
@MainActor
struct PruebasEstadisticas {
    var cal: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "America/Santiago")!; return c }
    func ms(_ d: Int, _ m: Int = 9, h: Int = 21) -> Double {
        cal.date(from: DateComponents(year: 2026, month: m, day: d, hour: h))!.timeIntervalSince1970 * 1000
    }

    @Test func tuMesComoLaWeb() throws {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let eps = catalogo.episodios(de: "xmen97")
        try #require(eps.count >= 3)
        _ = p.suma(["logan": ms(1), "the-wolverine": ms(2), "cap1": ms(2), "dofp": ms(20, 8), "xmen1": 1],
                   Dictionary(uniqueKeysWithValues: eps.prefix(2).map { ($0.clave("xmen97"), ms(3)) }))
        p.ponEstrellas(4, a: "the-wolverine"); p.ponEstrellas(4, a: "logan"); p.ponEstrellas(5, a: "dofp")
        let sep = Mes(clave: 2026 * 12 + 8)
        let r = p.resumen(mes: sep, calendario: cal)
        #expect(r.titulos == 3 && r.episodios == 2, "agosto y la marca por bits no cuentan")
        #expect(r.porDia == [1: 1, 2: 2, 3: 2] && r.dias == 3 && r.racha == 3)
        #expect(r.saga?.id == "xmen" && r.saga?.n == 2)
        #expect(r.favorito == "the-wolverine", "a igual nota, el último marcado")
        let serie = try #require(catalogo.titulo("xmen97"))
        let esperado = Double(["logan", "the-wolverine", "cap1"].compactMap { catalogo.titulo($0)?.d }.reduce(0, +))
            + Double(serie.d ?? 0) * 2 / Double(eps.count)
        #expect(abs(r.minutos - esperado) < 0.001)
        #expect(p.resumen(mes: sep.anterior, calendario: cal).favorito == "dofp")
        let meses = p.mesesConMarcas(hoy: Date(timeIntervalSince1970: ms(3, 10) / 1000), calendario: cal)
        #expect(meses.map(\.mes) == [10, 9, 8], "el actual siempre, sin el 1970 de las marcas por bits")
    }

    @Test func marcasDelDiaYDiario() {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let eps = catalogo.episodios(de: "xmen97")
        _ = p.suma(["logan": ms(2, h: 22), "cap1": ms(2, h: 10), "dofp": ms(1)],
                   Dictionary(uniqueKeysWithValues: eps.prefix(3).map { ($0.clave("xmen97"), ms(2, h: 15)) }))
        let dia = Date(timeIntervalSince1970: ms(2, h: 12) / 1000)
        let m = p.marcas(dia: dia, calendario: cal)
        #expect(m.map(\.id) == ["cap1", "xmen97", "logan"])
        #expect(m[1].episodios == 3 && m[0].episodios == 0)
        #expect(p.diario().map(\.id) == ["logan", "cap1", "dofp"])
        #expect(p.diario(limite: 1).count == 1)
    }
}

@Suite("Multiverso")
@MainActor struct PruebasMultiverso {
    @Test func cadaTierraTieneTitulosYOrbita() {
        for u in catalogo.multiverso {
            #expect(!catalogo.titulos(de: u).isEmpty, "\(u.num) sin títulos")
            #expect(u.num == "Tierra-616" || catalogo.orbita(u.num) != nil, "\(u.num) sin órbita")
        }
        // cada anillo con sus Tierras y cada arista entre títulos que existen
        #expect(catalogo.anillos.allSatisfy { !catalogo.universos(anillo: $0).isEmpty })
        #expect(catalogo.aristas.allSatisfy { catalogo.titulo($0.a) != nil && catalogo.titulo($0.b) != nil })
    }

    @Test func la616NoTraeLosDeOtroUniverso() {
        let u = catalogo.universo("Tierra-616")!
        let ts = catalogo.titulos(de: u)
        #expect(ts.allSatisfy { $0.uni == nil && catalogo.saga(de: $0.id) == "ucm" })
        #expect(!ts.contains { $0.id == "deadpool3" })
    }

    @Test func nombresEnIngles() {
        #expect(catalogo.numero("Tierra-616", en: .en) == "Earth-616")
        #expect(catalogo.numero("El Vacío", en: .en) == "The Void")
        #expect(catalogo.numero("El Vacío", en: .es) == "El Vacío")
        #expect(catalogo.numeroCorto("Tierra-10005", en: .es) == "T-10005")
        #expect(catalogo.numeroCorto("Tierra-10005", en: .en) == "E-10005")
        #expect(catalogo.numeroCorto("Tierra-121698", en: .en) == "Fox's FF")
    }

    @Test func crucesYConexiones() {
        // como la web: de más a menos títulos en común y, a igualdad, en el orden de data.js
        let u616 = catalogo.universo("Tierra-616")!
        #expect(catalogo.cruces(de: u616).map(\.universo.num) == ["El Vacío", "Tierra-96283", "Tierra-120703", "Tierra-838"])
        #expect(catalogo.cruces(de: u616).first?.comunes == 2)
        let fox = catalogo.universo("Tierra-10005")!
        let mios = Set(catalogo.titulos(de: fox).map(\.id))
        let con = catalogo.conexiones(de: fox)
        #expect(con.contains { $0.aqui.id == "logan" && $0.otro.id == "deadpool3" })
        #expect(con.allSatisfy { mios.contains($0.aqui.id) })
    }

    @Test func progresoPorTierraYResumen() {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let raimi = catalogo.universo("Tierra-96283")!
        #expect(p.progreso(de: raimi).vistos == 0)
        #expect(p.siguiente(en: raimi)?.id == catalogo.titulos(de: raimi).first?.id)
        for t in catalogo.titulos(de: raimi) { p.alternar(t.id) }
        #expect(p.progreso(de: raimi).completa)
        #expect(p.siguiente(en: raimi) == nil)
        let r = p.resumenMultiverso
        #expect(r.completas >= 1 && r.cuentan == catalogo.multiverso.filter { $0.opc != true }.count)
        // nwh está también en la de Garfield y en la 616: cuenta una vez
        #expect(r.vistos == catalogo.titulos(de: raimi).count)
        // los 4F de Fox son opcionales: no suman al total
        let fox4 = catalogo.titulos(de: catalogo.universo("Tierra-121698")!).map(\.id)
        let todos = Set(catalogo.multiverso.filter { $0.opc != true }.flatMap { catalogo.titulos(de: $0).map(\.id) })
        #expect(r.total == todos.count && fox4.contains { !todos.contains($0) })
    }
}

@Suite("Horario")
@MainActor struct PruebasHorario {
    /// Un lunes de octubre a mediodía, en Chile (con cambio de hora en septiembre)
    var cal: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "America/Santiago")!; return c }
    var lunes: Date { cal.date(from: DateComponents(year: 2026, month: 10, day: 5, hour: 12))! }

    @Test func simulaIgualQueLaWeb() {
        for c in vectores.horario {
            let p = Progreso(catalogo: catalogo, archivo: nil)
            _ = p.suma(Dictionary(uniqueKeysWithValues: c.vistas.map { ($0, 1) }), Dictionary(uniqueKeysWithValues: c.eps.map { ($0, 1) }))
            let sim = p.simula(c.h, desde: lunes, calendario: cal, detalladas: 8)
            #expect(sim.totalMin == c.totalMin, "\(c.nombre): \(sim.totalMin) vs \(c.totalMin), \(sim.nSesiones) vs \(c.nSesiones)")
            #expect(sim.nSesiones == c.nSesiones, "\(c.nombre)")
            #expect(sim.seAcaba == c.seAcaba, "\(c.nombre)")
            let mias = sim.sesiones.map { s in s.trozos.map { [$0.titulo.id, $0.episodios(en: .es)] } }
            #expect(mias == c.sesiones.map(\.trozos), "\(c.nombre)")
            #expect(sim.sesiones.map(\.min) == c.sesiones.map(\.min), "\(c.nombre)")
        }
    }

    @Test func soloLosDiasElegidos() {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let h = Horario(dias: [5, 6], min: 90, hora: "21:00", exp: true)
        let sim = p.simula(h, desde: lunes, calendario: cal)
        // del lunes 5: viernes 9, sábado 10, viernes 16…
        #expect(sim.sesiones.map { cal.component(.day, from: $0.fecha) } == [9, 10, 16, 17, 23])
        #expect(sim.seAcaba && sim.fin.map { Horario.dia($0, cal) }.map { [5, 6].contains($0) } == true)
        #expect(p.sesionDeHoy(h, hoy: lunes, calendario: cal) == nil)
        let viernes = cal.date(byAdding: .day, value: 4, to: lunes)!
        #expect(p.sesionDeHoy(h, hoy: viernes, calendario: cal)?.trozos.first?.titulo.id == sim.sesiones.first?.trozos.first?.titulo.id)
    }

    @Test func laSesionDeHoyYaHechaNoCorreLasSiguientes() {
        let h = Horario(dias: [1], min: 120, hora: "21:00", exp: true)
        let antes = cal.date(bySettingHour: 20, minute: 0, second: 0, of: lunes)!
        let durante = cal.date(bySettingHour: 22, minute: 0, second: 0, of: lunes)!
        let despues = cal.date(bySettingHour: 23, minute: 30, second: 0, of: lunes)!
        let martes = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: lunes))!
        #expect(h.primerDia(ahora: antes, cal) == cal.startOfDay(for: lunes))
        #expect(h.primerDia(ahora: durante, cal) == martes)
        #expect(h.primerDia(ahora: durante, cal, despuesDe: h.min) == cal.startOfDay(for: lunes))
        #expect(h.primerDia(ahora: despues, cal, despuesDe: h.min) == martes)
        // un día sin sesión empieza hoy aunque sea tarde
        let martesNoche = cal.date(bySettingHour: 23, minute: 0, second: 0, of: martes)!
        #expect(h.primerDia(ahora: martesNoche, cal) == martes)
    }

    @Test func minutosParaLlegar() {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let h = Horario(dias: [0, 1, 2, 3, 4, 5, 6], min: 60, hora: "21:00", exp: true)
        // diez días (del lunes 5 al miércoles 14, sin el 15): 1000 min → 100 por sesión
        let tope = cal.date(from: DateComponents(year: 2026, month: 10, day: 15))!
        #expect(p.minutosNecesarios(h, total: 1000, antesDe: tope, desde: lunes, calendario: cal) == 100)
        #expect(p.minutosNecesarios(h, total: 1000, antesDe: cal.startOfDay(for: lunes), desde: lunes, calendario: cal) == nil)
    }

    @Test func laMetaEsElPrimerEstrenoDeLaLista() throws {
        let hoy = cal.date(from: DateComponents(year: 2026, month: 10, day: 5, hour: 12))!
        let o = try #require(catalogo.estrenoObjetivo(hoy: hoy, calendario: cal))
        let primero = catalogo.estrenos.first { e in e.fecha.flatMap { Catalogo.dia($0, cal) }.map { $0 > hoy } ?? false }
        #expect(o.estreno.t == primero?.t)
        // el día del estreno pasada la medianoche ya no cuenta
        let pasado = cal.date(byAdding: .minute, value: 1, to: o.fecha)!
        #expect(catalogo.estrenoObjetivo(hoy: pasado, calendario: cal)?.estreno.t != o.estreno.t)
    }

    @Test func saneaComoLaWeb() {
        #expect(Horario(dias: [], min: 90, hora: "21:00", exp: true).saneado == nil)
        #expect(Horario(dias: [7, 9], min: 90, hora: "21:00", exp: true).saneado == nil)
        #expect(Horario(dias: [1], min: 10, hora: "21:00", exp: true).saneado == nil)
        #expect(Horario(dias: [1, 8], min: 90, hora: "25:00", exp: false).saneado == Horario(dias: [1], min: 90, hora: "21:00", exp: false))
        #expect(Horario(dias: [1], min: 90, hora: "00:30", exp: true).saneado?.hora == "00:30")
        #expect(Horario.porDefecto.saneado == Horario.porDefecto)
    }

    @Test func textoDeEpisodios() throws {
        let t = try #require(catalogo.titulos.first { $0.esSerie && catalogo.episodios(de: $0.id).count > 2 })
        let e = catalogo.episodios(de: t.id)
        #expect(TrozoSesion(titulo: t, desde: e[0], hasta: e[0]).episodios(en: .es) == "T\(e[0].s)·E\(e[0].n)")
        #expect(TrozoSesion(titulo: t, desde: e[0], hasta: e[2]).episodios(en: .en) == "S\(e[0].s)·E\(e[0].n)–S\(e[2].s)·E\(e[2].n)")
        #expect(TrozoSesion(titulo: t, desde: nil, hasta: nil).episodios(en: .es) == "")
    }
}

// MARK: Lector de cómics

import Compression

/// Un ZIP armado a mano (sin CRC: el lector no lo mira), con DEFLATE de verdad
/// en las entradas que lo piden
func zipDePrueba(_ entradas: [(nombre: String, datos: Data, deflate: Bool)]) -> Data {
    func le16(_ v: Int) -> Data { withUnsafeBytes(of: UInt16(v).littleEndian) { Data($0) } }
    func le32(_ v: Int) -> Data { withUnsafeBytes(of: UInt32(v).littleEndian) { Data($0) } }
    var zip = Data(), cd = Data()
    for e in entradas {
        var comp = e.datos
        if e.deflate {
            var buf = [UInt8](repeating: 0, count: e.datos.count + 1024)
            let n = e.datos.withUnsafeBytes { compression_encode_buffer(&buf, buf.count, $0.bindMemory(to: UInt8.self).baseAddress!, e.datos.count, nil, COMPRESSION_ZLIB) }
            comp = Data(buf[0..<n])
        }
        let nombre = Data(e.nombre.utf8), metodo = e.deflate ? 8 : 0, local = zip.count
        let cabecera: [Data] = [le32(0x04034b50), le16(20), le16(0x800), le16(metodo), le32(0), le32(0),
                                le32(comp.count), le32(e.datos.count), le16(nombre.count), le16(0), nombre, comp]
        let central: [Data] = [le32(0x02014b50), le16(20), le16(20), le16(0x800), le16(metodo), le32(0), le32(0),
                               le32(comp.count), le32(e.datos.count), le16(nombre.count), le16(0), le16(0), le16(0), le16(0),
                               le32(0), le32(local), nombre]
        cabecera.forEach { zip.append($0) }
        central.forEach { cd.append($0) }
    }
    let off = zip.count
    let fin: [Data] = [cd, le32(0x06054b50), le16(0), le16(0), le16(entradas.count), le16(entradas.count),
                       le32(cd.count), le32(off), le16(0)]
    fin.forEach { zip.append($0) }
    return zip
}

@Suite("Lector")
struct PruebasLector {
    let dir: URL = {
        let d = FileManager.default.temporaryDirectory.appendingPathComponent("lector-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()
    func escribe(_ nombre: String, _ datos: Data) -> URL {
        let u = dir.appendingPathComponent(nombre)
        try! datos.write(to: u)
        return u
    }
    let pagina = Data((0..<5000).map { UInt8($0 % 7) })

    @Test func leeElZipEnOrdenNaturalYSinBasura() throws {
        let u = escribe("x.cbz", zipDePrueba([
            ("p10.jpg", Data("diez".utf8), false), ("p2.jpg", pagina, true), ("p1.png", Data("uno".utf8), false),
            ("__MACOSX/._p1.png", Data("no".utf8), false), (".DS_Store", Data(), false), ("info.txt", Data("no".utf8), false),
            ("carpeta/", Data(), false),
        ]))
        let z = try ArchivoZip(url: u)
        #expect(z.nombres == ["p1.png", "p2.jpg", "p10.jpg"])
        #expect(try z.pagina(0) == Data("uno".utf8))
        #expect(try z.pagina(1) == pagina, "DEFLATE")
        #expect(try z.pagina(2) == Data("diez".utf8))
        #expect(throws: ErrorLector.danado(pagina: 3)) { try z.pagina(3) }
        // DEFLATE que dice ocupar 0 bytes comprimidos (CBZ dañado): error, no cierre de la app
        var roto = zipDePrueba([("a.jpg", pagina, true)])
        roto.replaceSubrange(18..<22, with: [0, 0, 0, 0])
        let cd = roto.count - 22 - (46 + 5)
        roto.replaceSubrange(cd + 20 ..< cd + 24, with: [0, 0, 0, 0])
        let z2 = try ArchivoZip(url: escribe("roto.cbz", roto))
        #expect(throws: ErrorLector.danado(pagina: 0)) { try z2.pagina(0) }
    }

    @Test func rechazaRarYBasura() {
        let rar = escribe("x.cbr", Data([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0, 0]))
        #expect(throws: ErrorLector.rar) { try ArchivoZip(url: rar) }
        #expect(throws: ErrorLector.noEsZip) { try ArchivoZip(url: escribe("y.cbz", Data("hola, no soy un zip".utf8))) }
        #expect(throws: ErrorLector.sinPaginas) { try ArchivoZip(url: escribe("z.cbz", zipDePrueba([("a.txt", Data("t".utf8), true)]))) }
    }

    @MainActor @Test func bibliotecaGuardaCambiaYQuita() async throws {
        let carpeta = dir.appendingPathComponent("Comics")
        let b = Biblioteca(carpeta: carpeta)
        let cbr = escribe("Mi comic.cbr", zipDePrueba([("1.jpg", pagina, true)]))  // .cbr que es ZIP: vale
        let a = try await b.guarda([cbr], para: "c-dofp")
        #expect(a.tipo == .zip && a.nombre == "Mi comic.cbr" && a.tam > 0)
        guard case let .zip(z) = try b.fuente("c-dofp") else { Issue.record("no es zip"); return }
        #expect(z.total == 1)
        // un RAR de verdad no se guarda y el de antes sigue
        let rar = escribe("r.cbr", Data([0x52, 0x61, 0x72, 0x21, 0, 0]))
        await #expect(throws: ErrorLector.rar) { try await b.guarda([rar], para: "c-dofp") }
        #expect(b.archivos["c-dofp"]?.nombre == "Mi comic.cbr")
        // cambiar por imágenes sueltas: en orden natural, y el CBZ de antes se borra
        let imgs = ["b10.png", "b2.png", "nota.txt"].map { escribe($0, Data($0.utf8)) }
        let i = try await b.guarda(imgs, para: "c-dofp")
        #expect(i.tipo == .imagenes && i.nombre == "2")
        guard case let .imagenes(pags) = try b.fuente("c-dofp") else { Issue.record("no son imágenes"); return }
        #expect(try pags.map { try Data(contentsOf: $0) } == [Data("b2.png".utf8), Data("b10.png".utf8)])
        #expect(!FileManager.default.fileExists(atPath: carpeta.appendingPathComponent("c-dofp.cbz").path))
        // otra biblioteca sobre la misma carpeta lo encuentra; quitar lo borra
        #expect(Biblioteca(carpeta: carpeta).archivos["c-dofp"] == i)
        b.quita("c-dofp")
        #expect(b.archivos.isEmpty && Biblioteca(carpeta: carpeta).archivos.isEmpty)
        #expect(throws: ErrorLector.vacio) { try b.fuente("c-dofp") }
    }

    @MainActor @Test func paginaPorLaQueVas() throws {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let id = try #require(catalogo.titulos.first { catalogo.saga(de: $0.id) == "comics" }).id
        p.ponPagina(40, de: 24, a: id)
        #expect(p.lecturas[id]?.p == 23 && p.lecturas[id]?.t == 24)
        // leerlo entero la olvida
        p.alternar(id)
        #expect(p.lecturas[id] == nil)
        p.alternar(id)
        p.ponPagina(3, de: 24, a: id)
        p.olvidaLectura(id)
        #expect(p.lecturas.isEmpty)
    }

    @MainActor @Test func lasLecturasDeLaWebEntranSaneadas() throws {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let ids = catalogo.titulos.filter { catalogo.saga(de: $0.id) == "comics" }.map(\.id)
        let (a, b, c) = (ids[0], ids[1], ids[2])
        p.ponPagina(1, de: 10, a: a)
        p.alternar(c)
        let json = #"{"v":{},"l":{"\#(a)":{"p":7,"t":10},"\#(b)":{"p":30,"t":20,"f":5},"\#(c)":{"p":2,"t":9},"nada":{"p":1,"t":5},"\#(ids[3])":{"p":1.5,"t":4},"\#(ids[4])":{"p":true,"t":4}}}"#
        let r = try #require(p.importa(codigoWeb: Data(json.utf8).base64EncodedString()))
        #expect(r.lecturas == 1)
        #expect(p.lecturas[a]?.p == 1, "la de aquí no se pisa")
        #expect(p.lecturas[b] == Lectura(p: 19, t: 20, f: 5), "p se corta a t-1")
        #expect(p.lecturas[c] == nil, "ya leído")
        #expect(p.lecturas["nada"] == nil && p.lecturas[ids[3]] == nil && p.lecturas[ids[4]] == nil)
    }
}

@Suite("Listas")
@MainActor
struct PruebasListas {
    @Test func crearMeterYVer() throws {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        #expect(p.creaLista("   ") == nil, "sin nombre no hay lista")
        let id = try #require(p.creaLista("  Para ver con Cata  "))
        #expect(p.lista(id)?.nombre == "Para ver con Cata" && id.count == 7)
        ["x2", "xmen1", "cap1"].forEach { p.alternar($0, enLista: id) }
        p.alternarVista("x2", enLista: id)
        let l = try #require(p.lista(id))
        #expect(l.vistos == 1 && !p.visto("x2"), "lo visto en la lista no toca el maratón")
        let orden = p.titulos(de: l).map(\.id)
        let pos = Dictionary(uniqueKeysWithValues: catalogo.titulos.enumerated().map { ($1.id, $0) })
        #expect(orden.count == 3 && orden == orden.sorted { pos[$0]! < pos[$1]! }, "en el orden del maratón")
        p.alternar("x2", enLista: id)
        #expect(p.lista(id)?.prog["x2"] == nil && p.lista(id)?.items.count == 2, "sacarlo olvida lo visto")
        p.renombraLista(id, a: String(repeating: "a", count: 200))
        #expect(p.lista(id)?.nombre.count == Lista.largoNombre)
        p.borraLista(id)
        #expect(p.listas.isEmpty)
    }

    @Test func seGuardanEnElArchivo() throws {
        let archivo = FileManager.default.temporaryDirectory
            .appendingPathComponent("maraton-\(UUID().uuidString)/progreso.json")
        defer { try? FileManager.default.removeItem(at: archivo.deletingLastPathComponent()) }
        let p = Progreso(catalogo: catalogo, archivo: archivo)
        let id = try #require(p.creaLista("Mutantes"))
        p.alternar("logan", enLista: id)
        p.alternarVista("logan", enLista: id)
        let q = Progreso(catalogo: catalogo, archivo: archivo)
        #expect(q.listas == p.listas && q.lista(id)?.vista("logan") == true)
    }

    @Test func entranConElCodigoDeLaWeb() throws {
        // «l» son las listas en la web (KEY_LISTAS), no las páginas de los cómics
        let json = #"""
        {"v":{},"e":{},"l":[
          {"id":"abc1234","nombre":"Con Cata","items":["logan","x2","no-existe","logan"],"prog":{"logan":1727000000000,"x2":true,"no-existe":5}},
          {"nombre":{"raro":1},"items":"nada"},
          7
        ]}
        """#
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let r = try #require(p.importa(codigoWeb: Data(json.utf8).base64EncodedString()))
        #expect(r.listas == 2 && r.lecturas == 0)
        let l = try #require(p.lista("abc1234"))
        #expect(l.items == ["logan", "x2"], "sin títulos que no existen ni repetidos")
        #expect(l.prog == ["logan": 1727000000000, "x2": 1])
        #expect(p.listas.last?.nombre == "Lista" && p.listas.last?.items.isEmpty == true, "lo malformado se sanea")
        // otra vez con un título más: se suma a la misma lista sin borrar nada
        p.alternarVista("x2", enLista: "abc1234")
        let mas = #"{"v":{},"l":[{"id":"abc1234","nombre":"Otro nombre","items":["cap1"],"prog":{}}]}"#
        let r2 = try #require(p.importa(codigoWeb: Data(mas.utf8).base64EncodedString()))
        let l2 = try #require(p.lista("abc1234"))
        #expect(r2.listas == 1 && l2.items == ["logan", "x2", "cap1"] && l2.nombre == "Con Cata" && l2.prog["x2"] == nil)
        #expect(try #require(p.importa(codigoWeb: Data(mas.utf8).base64EncodedString())).listas == 0, "nada nuevo")
    }
}

@Suite("Personas")
struct PruebasPersonas {
    @Test func separaLaDireccion() {
        #expect(Personas.separa(direccion: "Anthony y Joe Russo") == ["Anthony Russo", "Joe Russo"])
        #expect(Personas.separa(direccion: "Markus y McFeely (creadores)") == ["Markus", "McFeely"])
        #expect(Personas.separa(direccion: "Robert N. Skir, Marty Isenberg y David Wise (creadores)") == ["Robert N. Skir", "Marty Isenberg", "David Wise"])
        #expect(Personas.separa(direccion: "James Mangold") == ["James Mangold"])
        #expect(Personas.limpia("Vin Diesel (voz)") == "Vin Diesel")
    }

    @Test func leeLaRespuestaDeTMDB() throws {
        let logan = try #require(catalogo.tmdb("logan"))
        let inverso = catalogo.tmdbInverso
        #expect(inverso["\(logan.tipo):\(logan.numero)"] == "logan")
        let j: [String: Any] = [
            "name": "Hugh Jackman", "biography": "  Actor australiano.  ", "birthday": "1968-10-12", "deathday": NSNull(),
            "place_of_birth": "Sydney, New South Wales, Australia [now]", "imdb_id": "nm0413168", "profile_path": "/x.jpg",
            "combined_credits": [
                "cast": [
                    ["id": logan.numero, "media_type": logan.tipo, "character": "Logan / Wolverine (voice)", "release_date": "2017-03-01"],
                    ["id": 1, "media_type": "movie", "character": "Phineas", "title": "The Greatest Showman", "poster_path": "/g.jpg",
                     "vote_count": 9000, "release_date": "2017-12-20"],
                    ["id": 2, "media_type": "tv", "character": "Himself", "name": "Late Show", "poster_path": "/l.jpg", "vote_count": 99999],
                    ["id": 3, "media_type": "movie", "character": "Prisoner", "title": "Paperback Hero", "poster_path": "/p.jpg",
                     "vote_count": 10, "release_date": "1999-01-01", "genre_ids": [18]],
                    ["id": 4, "media_type": "movie", "title": "Doc", "poster_path": "/d.jpg", "vote_count": 50000, "genre_ids": [99],
                     "release_date": "1980-01-01"],
                ] as [[String: Any]],
                "crew": [["id": 1, "media_type": "movie", "job": "Producer", "title": "The Greatest Showman", "poster_path": "/g.jpg"],
                         ["id": 5, "media_type": "movie", "job": "Thanks", "title": "Drive", "poster_path": "/dr.jpg", "vote_count": 20000],
                         ["id": 6, "media_type": "tv", "character": "Hugh Jackman (voice)", "name": "Rick", "poster_path": "/r.jpg", "vote_count": 20000]],
            ] as [String: Any],
        ]
        let d = DatosPersona.lee(j, inverso: inverso)
        #expect(d.bio == "Actor australiano." && d.lugar == "Sydney, New South Wales, Australia" && d.muerte == nil)
        #expect(d.enMaraton == ["logan"] && d.papeles["logan"] == "Logan / Wolverine")
        #expect(d.carrera.desde == 1999, "sin el documental de 1980")
        #expect(d.carrera.conocido.map(\.t) == ["The Greatest Showman", "Paperback Hero"], "sin repetidos, sin él mismo, sin lo del maratón")
        #expect(d.carrera.creditos == 3)
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "America/Santiago")!
        let hoy = try #require(cal.date(from: DateComponents(year: 2026, month: 10, day: 4)))
        #expect(d.edad(hoy: hoy, calendario: cal) == 57)
    }

    @Test func eligeEntreHomonimos() {
        let logan = catalogo.tmdb("logan")!
        let inv = catalogo.tmdbInverso
        let rs: [[String: Any]] = [["id": 1, "name": "Hugh Jackman"],
                                   ["id": 2, "name": "Hugh Jackman", "known_for": [["media_type": logan.tipo, "id": logan.numero]]]]
        #expect(Personas.elige(rs, nombre: "Hugh Jackman", inverso: inv) == 2)
        #expect(Personas.elige([["id": 7, "name": "Otro"], ["id": 8, "name": "Hugh Jackmán"]], nombre: "Hugh Jackman", inverso: inv) == 8)
        #expect(Personas.elige([], nombre: "x", inverso: inv) == nil)
    }

    @Test func dondeSaleYComoSeLlama() {
        let ids = catalogo.titulos(dePersona: "Hugh Jackman").map(\.id)
        #expect(ids.contains("logan") && ids.contains("xmen1"))
        #expect(catalogo.titulos(dePersona: "Joe Russo").contains { $0.dir?.contains("Russo") == true })
        let modok = catalogo.personas(de: catalogo.titulo("modok")!)
        #expect(modok.filter { $0.nombre == "Patton Oswalt" }.map(\.esDireccion) == [true], "quien dirige y actúa, una vez")
        #expect(catalogo.personaje("Logan / Wolverine", en: .es) == "Logan / Lobezno")
        #expect(catalogo.personaje("Logan / Wolverine", en: .latam) == "Logan / Wolverine")
        #expect(catalogo.personaje("Steve Rogers / Captain America", en: .es) == "Steve Rogers / Capitán América")
        #expect(catalogo.personaje("Clint Barton / Hawkeye", en: .latam) == "Clint Barton / Hawkeye")
        #expect(catalogo.personaje("Wolverine", en: .en) == "Wolverine")
        #expect(Personas.esDelOficio(descripcion: "actor australiano", texto: String(repeating: "Hugh es actor. ", count: 10)))
        #expect(!Personas.esDelOficio(descripcion: "futbolista y entrenador", texto: String(repeating: "Juega al fútbol como actor. ", count: 10)))
    }
}

@Suite("Novedades y avisos de estreno")
@MainActor
struct PruebasNovedades {
    @Test func desdeTuUltimaVisita() {
        let n = catalogo.novedades(desde: "2026-10-13", hasta: "2026-10-20", seguidas: [])
        #expect(n.count == 1)
        if case let .estreno(e)? = n.first { #expect(e.t == "Vision Quest") } else { Issue.record("falta Vision Quest") }
        #expect(catalogo.novedades(desde: "2026-10-14", hasta: "2026-10-20", seguidas: []).isEmpty, "el día de antes no cuenta dos veces")
        // episodios de una serie que sigues, agrupados por día
        let primero = catalogo.episodios(de: "xmen97").compactMap(\.f).min()!
        let antes = Catalogo.diaAnterior(primero)
        let conSerie = catalogo.novedades(desde: antes, hasta: primero, seguidas: ["xmen97"])
        #expect(conSerie.contains { if case let .episodios(t, k) = $0 { t.id == "xmen97" && k >= 1 } else { false } })
        #expect(!catalogo.novedades(desde: antes, hasta: primero, seguidas: []).contains {
            if case .episodios = $0 { true } else { false } }, "sin seguirla, no")
    }

    @Test func proximosAvisos() {
        let a = catalogo.proximosAvisos(desde: "2026-10-14", seguidas: [])
        #expect(a.first?.fecha == "2026-10-14", "el de hoy entra")
        #expect(a.map(\.fecha) == a.map(\.fecha).sorted())
        #expect(a.contains { if case let .estreno(e) = $0.novedad { e.id == "doomsday" } else { false } })
        #expect(Set(a.map(\.clave)).count == a.count)
        #expect(catalogo.proximosAvisos(desde: "2026-10-15", seguidas: []).first?.fecha == "2026-12-18")
        #expect(Catalogo.diaAnterior("2026-03-01") == "2026-02-28")
        // con el calendario budista o el japonés del iPhone, las fechas siguen siendo gregorianas
        for id in [Calendar.Identifier.buddhist, .japanese] {
            var cal = Calendar(identifier: id); cal.timeZone = TimeZone(identifier: "America/Santiago")!
            let d = Catalogo.dia("2026-10-04", cal)!
            #expect(Catalogo.diaTexto(d, cal) == "2026-10-04")
        }
    }

    @Test func seriesQueSigues() {
        let p = Progreso(catalogo: catalogo, archivo: nil)
        let ep = catalogo.episodios(de: "xmen97")[0]
        p.alternar(ep, de: "xmen97")
        #expect(p.seriesSeguidas == ["xmen97"])
    }
}

@Suite("Filtros y sin spoilers")
struct PruebasFiltros {
    @Test func filtrosComoLaWeb() {
        let todos = catalogo.titulos
        let cuenta = { (f: Filtros) in todos.filter { catalogo.pasa($0, f, pais: "ES", visto: false) }.count }
        #expect(cuenta([]) == todos.count)
        #expect(cuenta(.sinSeries) == todos.filter { !$0.esSerie }.count)
        #expect(cuenta(.express) == todos.filter(\.esExpress).count)
        // las joyas: los cómics no tienen nota y no se esconden por eso
        let joyas = todos.filter { catalogo.pasa($0, .joyas, pais: "ES", visto: false) }
        #expect(joyas.allSatisfy { catalogo.saga(de: $0.id) == "comics" || ($0.s ?? 0) >= 7.5 })
        #expect(joyas.contains { catalogo.saga(de: $0.id) == "comics" })
        // lo visto se esconde solo con su filtro
        let t = todos[0]
        #expect(catalogo.pasa(t, .sinVistos, pais: "ES", visto: false))
        #expect(!catalogo.pasa(t, .sinVistos, pais: "ES", visto: true))
        #expect(Filtros([.joyas, .express]).cuantos == 2)
    }

    @Test func filtrosUtilesPorSaga() {
        #expect(!catalogo.filtrosUtiles(saga: "animacion").contains(.sinSeries), "Animación es toda series")
        #expect(!catalogo.filtrosUtiles(saga: "comics").contains(.joyas))
        #expect(catalogo.filtrosUtiles(saga: "ucm").count == Filtros.todos.count)
    }

    @Test func buscarSinEpisodiosNoVistos() {
        // «A mí, mis X-Men» solo es un episodio de X-Men '97
        let q = "A mí, mis X-Men"
        #expect(catalogo.buscar(q).contains { $0.id == "xmen97" })
        #expect(!catalogo.buscar(q, conEpisodios: { _ in false }).contains { $0.id == "xmen97" })
        #expect(catalogo.buscar("Wolverine", conEpisodios: { _ in false }).count > 0, "el título y el reparto siguen")
    }
}

@Suite("Noticias")
struct PruebasNoticias {
    @Test func leeComoLaWeb() throws {
        let json = """
        {"gen":"2026-10-04T15:25:46Z","es":[
          {"t":"Doomsday","url":"https://a.com/x","medio":"Espinof","f":1790344875000,"img":"noticias/0e7ad6982ee0f38b.webp"},
          {"t":"Sin https","url":"http://a.com/y"},
          {"t":"Imagen rara","url":"https://a.com/z","img":"../../etc/passwd"},
          {"url":"https://a.com/sin-titular"}],
         "en":"no es una lista"}
        """
        let n = try #require(Noticias.lee(Data(json.utf8)))
        #expect(n.es.map(\.titular) == ["Doomsday", "Imagen rara"])
        #expect(n.es[0].fecha == Date(timeIntervalSince1970: 1_790_344_875))
        #expect(Noticias.urlImagen(n.es[0])?.absoluteString == "https://ssebv.github.io/maraton-marvel/noticias/0e7ad6982ee0f38b.webp")
        #expect(n.es[1].imagen == nil)
        #expect(n.en.isEmpty)
        #expect(Noticias.lee(Data("[]".utf8)) == nil)
    }
}

@Suite("Perfil compartible y duelo")
@MainActor
struct PruebasPerfil {
    // hecho con generarPerfil de la web (nombre con tilde y emoji)
    let deLaWeb = "https://ssebv.github.io/maraton-marvel/?perfil=eyJuIjoiU2ViYXN0acOhbiDwn6a4IiwidiI6IkJRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQSIsImUiOiIiLCJyIjpbWzIsNV1dLCJ0IjoxNzkwMDAwMDAwMDAwfQ"

    @Test func leeElEnlaceDeLaWeb() throws {
        let p = try #require(PerfilCompartido.lee(deLaWeb))
        #expect(p.n == "Sebastián 🦸")
        #expect(p.fecha == Date(timeIntervalSince1970: 1_790_000_000))
        let otro = Progreso.ajeno(p, catalogo: catalogo)
        #expect(Set(otro.vistas.keys) == ["first-class", "dofp"])
        #expect(otro.nota("dofp").p == 5)
        // también solo el código, con espacios alrededor
        let cod = String(deLaWeb.split(separator: "=", maxSplits: 1)[1])
        #expect(PerfilCompartido.lee("  \(cod)\n") == p)
    }

    @Test func idaYVuelta() throws {
        let yo = Progreso(catalogo: catalogo, archivo: nil)
        yo.alternar("first-class"); yo.alternar("logan")
        yo.ponEstrellas(4, a: "logan")
        let p = yo.perfil(nombre: "  Ana  ")
        #expect(p.n == "Ana")
        let leido = try #require(PerfilCompartido.lee(p.enlace.absoluteString))
        #expect(leido == p)
        let otro = Progreso.ajeno(leido, catalogo: catalogo)
        #expect(Set(otro.vistas.keys) == Set(yo.vistas.keys))
        #expect(otro.nota("logan").p == 4)
        #expect(yo.perfil(nombre: " ").n == "Alguien")
    }

    @Test func rechazaLoQueNoEsPerfil() {
        #expect(PerfilCompartido.lee("hola") == nil)
        #expect(PerfilCompartido.lee("https://ssebv.github.io/maraton-marvel/?perfil=") == nil)
        // JSON válido pero sin v, o con tipos raros
        let sinV = Data(#"{"n":"x","e":""}"#.utf8).base64EncodedString()
        #expect(PerfilCompartido.lee(sinV) == nil)
        let raro = Data(#"{"n":5,"v":"AQ","r":[[9999,5],["a",1],[1,9]],"t":"ayer"}"#.utf8).base64EncodedString()
        let p = PerfilCompartido.lee(raro)
        #expect(p?.n == "Alguien")
        #expect(p?.r == [[9999, 5]])
        #expect(p?.t == nil)
        // una posición fuera del orden no rompe nada
        #expect(p.map { Progreso.ajeno($0, catalogo: catalogo).notas.isEmpty } == true)
    }

    @Test func dentroDelMensaje() throws {
        let p = try #require(PerfilCompartido.lee(deLaWeb))
        #expect(PerfilCompartido.lee("Así voy en el maratón. Ábrelo: \(deLaWeb) ¡suerte!") == p)
    }

    @Test func rivalesConElMismoNombre() {
        let cat = catalogo
        func perfil(_ n: String, _ ids: Set<String>) -> PerfilCompartido {
            PerfilCompartido(n: n, v: Bits.codifica(ids, orden: cat.ordenIds), e: "")
        }
        var l = Rivales.agrega(perfil("Alguien", ["logan"]), a: [])
        // otra persona sin nombre: no pisa a la primera
        l = Rivales.agrega(perfil("Alguien", ["dofp"]), a: l)
        #expect(l.map(\.n) == ["Alguien", "Alguien 2"])
        // la primera con un enlace nuevo (ha visto más): se pone al día
        l = Rivales.agrega(perfil("Alguien", ["logan", "first-class"]), a: l)
        #expect(l.count == 2)
        #expect(Bits.decodifica(l[0].v, orden: cat.ordenIds) == ["logan", "first-class"])
    }

    @Test func duelo() throws {
        let yo = Progreso(catalogo: catalogo, archivo: nil)
        yo.alternar("first-class"); yo.alternar("logan"); yo.alternar("c-dofp")
        let el = Progreso.ajeno(try #require(PerfilCompartido.lee(deLaWeb)), catalogo: catalogo)
        let d = yo.duelo(contra: el)
        #expect(d.comunes == 1)
        #expect(d.soloEl == ["dofp"])
        #expect(d.soloYo == ["logan"], "el cómic no cuenta en el duelo")
        #expect(d.diferencia == 0)
    }
}
