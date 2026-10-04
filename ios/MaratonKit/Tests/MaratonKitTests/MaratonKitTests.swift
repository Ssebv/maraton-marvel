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
