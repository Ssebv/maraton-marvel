import SwiftUI
import EventKit
import MaratonKit

/// El horario de maratón de la web: qué días ves, cuánto rato y a qué hora.
/// Mientras eliges, la simulación dice qué toca en cada sesión, cuándo
/// terminas y si llegas al próximo estreno (y con cuánto rato llegarías).
struct HorarioView: View {
    @Environment(\.catalogo) private var catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Agenda.self) private var agenda
    @Environment(\.dismiss) private var cerrar
    @State private var borrador = Horario.porDefecto
    @State private var avisos = true
    @State private var almacen: EKEventStore?
    @State private var evento: EKEvent?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text(ajustes.tr("Elige qué días ves y cuánto rato: la app te dice qué toca cada sesión y cuándo terminas.",
                                    "Pick which days you watch and for how long: the app tells you what each session covers and when you finish."))
                        .font(.subheadline)
                        .foregroundStyle(Tema.tinta2)
                    campos
                    if let catalogo { simulacion(catalogo) }
                }
                .padding(16)
                .padding(.bottom, 12)
            }
            .background(Tema.fondo)
            .navigationTitle(ajustes.tr("Tu horario", "Your schedule"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(ajustes.tr("Cancelar", "Cancel")) { cerrar() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(ajustes.tr("Guardar", "Save"), action: guardar).fontWeight(.semibold)
                }
            }
        }
        .tint(Tema.rojo)
        // el selector de hora y los días en el idioma de la app, no el del iPhone
        .environment(\.locale, ajustes.locale)
        .onAppear {
            borrador = agenda.horario ?? .porDefecto
            avisos = agenda.avisos
        }
        .sheet(item: $evento) { e in
            if let almacen {
                EditorEvento(evento: e, almacen: almacen) { _ in evento = nil }.ignoresSafeArea()
            }
        }
    }

    // MARK: Campos

    private var campos: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Rotulo(texto: ajustes.tr("Días", "Days"))
                HStack(spacing: 6) {
                    ForEach(Horario.diasEnOrden, id: \.self) { d in
                        BotonDia(letra: letra(d), nombre: nombreDia(d), elegido: borrador.dias.contains(d)) {
                            // sin días no hay horario: el último no se suelta
                            if borrador.dias.contains(d) { if borrador.dias.count > 1 { borrador.dias.remove(d) } }
                            else { borrador.dias.insert(d) }
                        }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                Rotulo(texto: ajustes.tr("Cada sesión", "Each session"))
                Picker(ajustes.tr("Cada sesión", "Each session"), selection: $borrador.min) {
                    ForEach(Horario.duraciones, id: \.self) { Text(Formato.duracion($0)).tag($0) }
                    // un horario de la web con otra duración se conserva
                    if !Horario.duraciones.contains(borrador.min) {
                        Text(Formato.duracion(borrador.min)).tag(borrador.min)
                    }
                }
                .pickerStyle(.segmented)
            }
            VStack(spacing: 0) {
                DatePicker(ajustes.tr("Empieza a las", "Starts at"), selection: horaElegida, displayedComponents: .hourAndMinute)
                    .padding(.horizontal, 14).frame(minHeight: 52)
                Divider().padding(.leading, 14)
                Toggle(ajustes.tr("Solo la ruta express", "Express route only"), isOn: $borrador.exp)
                    .padding(.horizontal, 14).frame(minHeight: 52)
                Divider().padding(.leading, 14)
                Toggle(isOn: $avisos) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ajustes.tr("Avisarme antes de cada sesión", "Remind me before each session"))
                        Text(ajustes.tr("\(Agenda.antelacion) min antes, con lo que toca", "\(Agenda.antelacion) min before, with what’s up"))
                            .font(.caption).foregroundStyle(Tema.tinta2)
                    }
                }
                .padding(.horizontal, 14).frame(minHeight: 60)
            }
            .tint(Tema.verde)
            .superficie(radio: Tema.radioL)
        }
    }

    /// La hora «HH:MM» del borrador como Date de hoy, para el DatePicker
    private var horaElegida: Binding<Date> {
        Binding {
            borrador.inicio(el: Date(), .current)
        } set: { d in
            let c = Calendar.current.dateComponents([.hour, .minute], from: d)
            borrador.hora = String(format: "%02d:%02d", c.hour ?? 21, c.minute ?? 0)
        }
    }

    // MARK: Simulación

    @ViewBuilder
    private func simulacion(_ catalogo: Catalogo) -> some View {
        let sim = progreso.simula(borrador)
        if sim.totalMin == 0 {
            Aviso(icono: "checkmark.seal.fill", color: Tema.verde,
                  texto: borrador.exp
                    ? ajustes.tr("No queda nada pendiente en la ruta express. Quita el filtro para planificar el maratón completo.",
                                 "Nothing left on the express route. Remove the filter to plan the full marathon.")
                    : ajustes.tr("No queda nada pendiente. ¡Maratón terminado!", "Nothing left to watch. Marathon complete!"))
        } else {
            VStack(alignment: .leading, spacing: 14) {
                Text(LocalizedStringKey(resumen(sim))).font(.subheadline)
                veredicto(sim, catalogo)
                VStack(alignment: .leading, spacing: 8) {
                    Rotulo(texto: ajustes.tr("Próximas sesiones", "Next sessions"))
                    VStack(spacing: 0) {
                        ForEach(sim.sesiones, id: \.fecha) { s in
                            if s.fecha != sim.sesiones.first?.fecha { Divider().padding(.leading, 14) }
                            FilaSesion(sesion: s, hora: borrador.hora)
                        }
                    }
                    .superficie(radio: Tema.radioL)
                    if sim.nSesiones > sim.sesiones.count {
                        let mas = sim.nSesiones - sim.sesiones.count
                        Text(ajustes.tr("…y \(mas) sesiones más, siempre con lo que toque entonces.",
                                        "…and \(mas) more sessions, always with whatever is next."))
                            .font(.footnote).foregroundStyle(Tema.tinta2)
                    }
                }
                acciones(sim)
            }
        }
        if agenda.horario != nil {
            Button(ajustes.tr("Quitar horario", "Remove schedule"), role: .destructive) {
                agenda.horario = nil
                cerrar()
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 4)
        }
    }

    private func resumen(_ sim: SimulacionHorario) -> String {
        let n = borrador.dias.count
        let sesiones = n == 1 ? ajustes.tr("Una sesión", "One session") : ajustes.tr("\(n) sesiones", "\(n) sessions")
        let dur = Formato.duracion(borrador.min), quedan = Formato.duracion(sim.totalMin)
        return borrador.exp
            ? ajustes.tr("\(sesiones) de \(dur) a la semana · quedan **\(quedan)** de la ruta express",
                         "\(sesiones) of \(dur) a week · **\(quedan)** left on the express route")
            : ajustes.tr("\(sesiones) de \(dur) a la semana · quedan **\(quedan)** del maratón (sin cómics ni animación)",
                         "\(sesiones) of \(dur) a week · **\(quedan)** left in the marathon (comics and animation aside)")
    }

    @ViewBuilder
    private func veredicto(_ sim: SimulacionHorario, _ catalogo: Catalogo) -> some View {
        if sim.seAcaba, let fin = sim.fin {
            let cuando = fin.formatted(.dateTime.day().month(.wide).year().locale(ajustes.locale))
            let base = ajustes.tr("Terminarías el **\(cuando)**, en \(sim.nSesiones) sesiones",
                                  "You’d finish on **\(cuando)**, over \(sim.nSesiones) sessions")
            if let (e, tope) = catalogo.estrenoObjetivo() {
                let dia = tope.formatted(.dateTime.day().month(.abbreviated).locale(ajustes.locale))
                if fin <= tope {
                    Aviso(icono: "checkmark.circle.fill", color: Tema.verde,
                          texto: base + ajustes.tr(" — **llegas** al estreno de \(e.t) (\(dia)).", " — **in time** for the premiere of \(e.t) (\(dia))."))
                } else {
                    let falta = progreso.minutosNecesarios(borrador, total: sim.totalMin, antesDe: tope)
                    let pista = falta.map { ajustes.tr("; con sesiones de **~\(Formato.duracion($0))** llegarías", "; sessions of **~\(Formato.duracion($0))** would get you there") } ?? ""
                    Aviso(icono: "clock.badge.exclamationmark.fill", color: Tema.oro,
                          texto: base + ajustes.tr(" — después del estreno de \(e.t) (\(dia))\(pista).", " — after the premiere of \(e.t) (\(dia))\(pista)."))
                }
            } else {
                Aviso(icono: "flag.checkered", color: Tema.verde, texto: base + ".")
            }
        } else {
            Aviso(icono: "exclamationmark.triangle.fill", color: Tema.rojo,
                  texto: ajustes.tr("Con ese horario no se acaba ni en dos años: añade días o alarga la sesión.",
                                    "That schedule doesn’t finish even in two years: add days or stretch the session."))
        }
    }

    @ViewBuilder
    private func acciones(_ sim: SimulacionHorario) -> some View {
        if sim.seAcaba {
            Button {
                let a = EKEventStore()
                almacen = a
                evento = Agenda.evento(borrador, sim, en: a, ajustes)
            } label: {
                Label(ajustes.tr("Añadir al Calendario", "Add to Calendar"), systemImage: "calendar.badge.plus")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(Tema.tinta2)
        }
    }

    private func guardar() {
        agenda.horario = borrador.saneado
        agenda.avisos = avisos
        // el permiso se pide al guardar con avisos, no al abrir la hoja
        if avisos { Task { _ = await agenda.pidePermiso() } }
        cerrar()
    }

    // MARK: Días

    private func letra(_ d: Int) -> String {
        ajustes.idioma == .en ? ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d] : ["D", "L", "M", "X", "J", "V", "S"][d]
    }

    private func nombreDia(_ d: Int) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = ajustes.locale
        return cal.weekdaySymbols[d]
    }
}

/// Un día de la semana: círculo rojo si está elegido
private struct BotonDia: View {
    let letra: String
    let nombre: String
    let elegido: Bool
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Text(letra)
                .font(.subheadline.weight(.bold))
                .frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(elegido ? .white : Tema.tinta)
                .background(elegido ? AnyShapeStyle(Tema.rojo) : AnyShapeStyle(Tema.panel), in: .circle)
                .overlay(Circle().strokeBorder(elegido ? .clear : Tema.linea, lineWidth: 1))
                .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: elegido)
        .animation(.snappy, value: elegido)
        .accessibilityLabel(nombre)
        .accessibilityAddTraits(elegido ? .isSelected : [])
    }
}

/// Una sesión: el día y la hora, y lo que toca con sus pósters
private struct FilaSesion: View {
    let sesion: SesionHorario
    let hora: String
    @Environment(\.catalogo) private var catalogo
    @Environment(Ajustes.self) private var ajustes

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(sesion.fecha.formatted(.dateTime.weekday(.abbreviated).locale(ajustes.locale)).capitalized)
                    .font(.caption.weight(.bold)).foregroundStyle(Tema.rojo)
                Text(sesion.fecha.formatted(.dateTime.day().month(.abbreviated).locale(ajustes.locale)))
                    .font(.subheadline.weight(.semibold))
                Text(hora).font(.caption.monospacedDigit()).foregroundStyle(Tema.tinta2)
            }
            .frame(width: 64, alignment: .leading)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: -10) {
                    ForEach(sesion.trozos.prefix(3), id: \.titulo.id) { t in
                        Poster(url: catalogo?.urlPoster(t.titulo.id, idioma: ajustes.idioma), ancho: 30, radio: Tema.radioS)
                            .shadow(color: .black.opacity(0.2), radius: 2)
                    }
                }
                if let catalogo {
                    Text(Agenda.contenido(sesion, catalogo, ajustes)).font(.subheadline)
                }
                Text("~\(Formato.duracion(sesion.min))").font(.caption).foregroundStyle(Tema.tinta2)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .accessibilityElement(children: .combine)
    }
}

/// Un recuadro con icono y texto (admite **negritas**)
private struct Aviso: View {
    let icono: String
    let color: Color
    let texto: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: icono).foregroundStyle(color)
            Text(LocalizedStringKey(texto)).font(.subheadline)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.1), in: .rect(cornerRadius: Tema.radioL))
        .overlay(RoundedRectangle(cornerRadius: Tema.radioL).strokeBorder(color.opacity(0.4), lineWidth: 1))
    }
}

/// En Inicio: la sesión de hoy o la próxima, con lo que toca; sin horario,
/// la invitación a ponerse uno
struct TarjetaHorario: View {
    let catalogo: Catalogo
    @Environment(Progreso.self) private var progreso
    @Environment(Ajustes.self) private var ajustes
    @Environment(Agenda.self) private var agenda
    @Environment(Navegacion.self) private var nav

    var body: some View {
        Button { nav.horarioAbierto = true } label: {
            Group {
                if let h = agenda.horario {
                    conHorario(h)
                } else {
                    HStack(spacing: 14) {
                        Image(systemName: "calendar.badge.clock")
                            .font(.title2).foregroundStyle(Tema.rojo)
                            .frame(width: 44, height: 44)
                            .background(Tema.rojo.opacity(0.12), in: .circle)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(ajustes.tr("Ponerme un horario", "Set a schedule")).font(.body.weight(.semibold))
                            Text(ajustes.tr("Elige días y duración: te digo qué toca cada sesión y cuándo terminas.",
                                            "Pick days and length: I’ll tell you what each session covers and when you finish."))
                                .font(.footnote).foregroundStyle(Tema.tinta2)
                                .multilineTextAlignment(.leading)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Tema.tinta3)
                    }
                }
            }
            .padding(14)
            .superficie(radio: Tema.radioL)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private func conHorario(_ h: Horario) -> some View {
        // la de hoy se enseña hasta que termina; después, la siguiente
        let sim = progreso.simula(h, desde: h.primerDia(ahora: Date(), .current, despuesDe: h.min), detalladas: 1)
        if let s = sim.sesiones.first {
            let hoy = Calendar.current.isDateInToday(s.fecha)
            let dia = hoy ? ajustes.tr("Hoy", "Today")
                : s.fecha.formatted(.dateTime.weekday(.wide).day().month(.abbreviated).locale(ajustes.locale)).capitalized
            HStack(spacing: 12) {
                HStack(spacing: -12) {
                    ForEach(s.trozos.prefix(2), id: \.titulo.id) { t in
                        Poster(url: catalogo.urlPoster(t.titulo.id, idioma: ajustes.idioma), ancho: 40, radio: Tema.radioS + 2)
                            .shadow(color: .black.opacity(0.25), radius: 3)
                    }
                }
                VStack(alignment: .leading, spacing: 3) {
                    Rotulo(texto: hoy ? ajustes.tr("Sesión de hoy", "Today’s session") : ajustes.tr("Próxima sesión", "Next session"),
                           color: hoy ? Tema.verde : Tema.rojo)
                    Text(Agenda.contenido(s, catalogo, ajustes))
                        .font(.body.weight(.semibold))
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                    Text(pie(dia: dia, hora: h.hora, sim))
                        .font(.footnote).foregroundStyle(Tema.tinta2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Tema.tinta3)
            }
        } else {
            Label(ajustes.tr("Horario cumplido: no queda nada pendiente", "Schedule done: nothing left to watch"), systemImage: "checkmark.seal.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Tema.verde)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

extension TarjetaHorario {
    /// «Lunes, 5 oct. · 21:30 · terminas el 15 ene. 2027»
    func pie(dia: String, hora: String, _ sim: SimulacionHorario) -> String {
        var partes = [dia, hora]
        if sim.seAcaba, let fin = sim.fin {
            let f = fin.formatted(.dateTime.day().month(.abbreviated).year().locale(ajustes.locale))
            partes.append(ajustes.tr("terminas el \(f)", "you finish \(f)"))
        }
        return partes.joined(separator: " · ")
    }
}

extension EKEvent: @retroactive Identifiable {
    public var id: ObjectIdentifier { ObjectIdentifier(self) }
}
