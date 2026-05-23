import os
import subprocess
import json
import tkinter as tk
from tkinter import filedialog, messagebox
from datetime import datetime
import customtkinter as ctk

# --- CONFIGURACIÓN PARA OCULTAR CONSOLA (Evita pestañeos en el EXE) ---
si = subprocess.STARTUPINFO()
si.dwFlags |= subprocess.STARTF_USESHOWWINDOW

# --- CONFIGURACIÓN DE APARIENCIA ---
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

archivos_seleccionados = []
datos_analisis = {}

DICC_IDIOMAS = {
    # Inglés
    "eng": "Inglés", "en": "Inglés",
    # Japonés
    "jpn": "Japonés", "ja": "Japonés",
    # Coreano
    "kor": "Coreano", "ko": "Coreano",
    # Chino
    "zho": "Chino", "zh": "Chino", "chi": "Chino",
    # Francés
    "fra": "Francés", "fr": "Francés", "fre": "Francés",
    # Alemán
    "ger": "Alemán", "de": "Alemán", "deu": "Alemán",
    # Portugués
    "por": "Portugués", "pt": "Portugués", "pt-br": "Portugués Brasil", "pt-pt": "Portugués Portugal",
    # Italiano
    "ita": "Italiano", "it": "Italiano",
    # Ruso
    "rus": "Ruso", "ru": "Ruso",
    # Árabe
    "ara": "Árabe", "ar": "Árabe",
    # Hindi
    "hin": "Hindi", "hi": "Hindi",
    # Turco
    "tur": "Turco", "tr": "Turco",
    # Polaco
    "pol": "Polaco", "pl": "Polaco",
    # Holandés / Neerlandés
    "nld": "Holandés", "nl": "Holandés", "dut": "Holandés",
    # Sueco
    "swe": "Sueco", "sv": "Sueco",
    # Noruego
    "nor": "Noruego", "no": "Noruego",
    # Danés
    "dan": "Danés", "da": "Danés",
    # Finlandés
    "fin": "Finlandés", "fi": "Finlandés",
    # Tailandés
    "tha": "Tailandés", "th": "Tailandés",
    # Vietnamita
    "vie": "Vietnamita", "vi": "Vietnamita",
    # Indonesio
    "ind": "Indonesio", "id": "Indonesio",
    # Filipino / Tagalo
    "tgl": "Filipino", "tl": "Filipino",
    # Ucraniano
    "ukr": "Ucraniano", "uk": "Ucraniano",
    # Griego
    "ell": "Griego", "el": "Griego", "gre": "Griego",
    # Hebreo
    "heb": "Hebreo", "he": "Hebreo",
    # Checo
    "ces": "Checo", "cs": "Checo", "cze": "Checo",
    # Húngaro
    "hun": "Húngaro", "hu": "Húngaro",
    # Rumano
    "ron": "Rumano", "ro": "Rumano", "rum": "Rumano",
    # Catalán
    "cat": "Catalán", "ca": "Catalán",
    # Gallego
    "glg": "Gallego", "gl": "Gallego",
    # Euskera
    "eus": "Euskera", "eu": "Euskera", "baq": "Euskera",
    # Desconocido
    "und": "Desconocido"
}

def centrar_ventana(ventana, ancho, alto):
    """Calcula las coordenadas para que la ventana aparezca en el centro"""
    pantalla_ancho = ventana.winfo_screenwidth()
    pantalla_alto = ventana.winfo_screenheight()
    x = (pantalla_ancho // 2) - (ancho // 2)
    y = (pantalla_alto // 2) - (alto // 2)
    ventana.geometry(f"{ancho}x{alto}+{x}+{y}")

def agregar_log(mensaje, tipo="INFO"):
    hora = datetime.now().strftime("%H:%M:%S")
    log_text.insert(tk.END, f"[{hora}] [{tipo}] {mensaje}\n")
    log_text.see(tk.END)
    root.update_idletasks()

def obtener_info_mkv(ruta_archivo):
    mkvmerge_path = r"C:\Program Files\MKVToolNix\mkvmerge.exe"
    if not os.path.exists(mkvmerge_path): return None
    try:
        # encoding="utf-8" evita el UnicodeDecodeError
        resultado = subprocess.run(
            [mkvmerge_path, "-J", ruta_archivo], 
            capture_output=True, text=True, encoding="utf-8", 
            check=True, startupinfo=si
        )
        return json.loads(resultado.stdout)
    except: return None

def identificar_idioma_inteligente(track):
    props = track.get('properties', {})
    t_lang_ietf = str(props.get('language_ietf', '')).lower().strip()
    t_lang_std = str(props.get('language', 'und')).lower().strip()
    t_name = str(props.get('track_name', '')).lower()

    if t_lang_ietf == "es-419": return "Español Latino"
    if t_lang_std in ["es", "spa"] or t_lang_ietf in ["es", "spa"]:
        if "latino" in t_name or "lat" in t_name: return "Español Latino"
        return "Español"
    return DICC_IDIOMAS.get(t_lang_std, f"Idioma: {t_lang_std.upper()}")

def analizar_archivos():
    global archivos_seleccionados, datos_analisis
    if not archivos_seleccionados:
        messagebox.showwarning("Aviso", "Selecciona archivos.")
        return
    log_text.delete('1.0', tk.END)
    agregar_log("Iniciando análisis profesional...", "SISTEMA")
    datos_analisis = {}
    
    for ruta in archivos_seleccionados:
        info = obtener_info_mkv(ruta)
        if not info: continue
        datos_analisis[ruta] = info
        agregar_log(f"ARCHIVO: {os.path.basename(ruta)}", "FILE")
        
        for track in info['tracks']:
            if track['type'] in ['audio', 'subtitles']:
                tipo = "Audio" if track['type'] == 'audio' else "Sub"
                nombre_res = identificar_idioma_inteligente(track)
                
                detalles = ""
                if track['type'] == 'subtitles':
                    if track['properties'].get('forced_track'):
                        detalles += " (Forzados)"
                    
                    # Detectar si es SDH / CC
                    t_name = str(track['properties'].get('track_name', '')).lower()
                    is_sdh = track['properties'].get('hearing_impaired_track') or "sdh" in t_name or "cc" in t_name
                    if is_sdh:
                        detalles += " (SDH)"
                
                l_code = track['properties'].get('language')
                agregar_log(f"  [{tipo}] -> {nombre_res}{detalles} ({l_code})", "INFO")
    btn_ejecutar.configure(state="normal", fg_color="#2ecc71")

def procesar_archivos():
    global archivos_seleccionados, datos_analisis
    mkvpropedit_path = r"C:\Program Files\MKVToolNix\mkvpropedit.exe"
    mkvmerge_path = r"C:\Program Files\MKVToolNix\mkvmerge.exe"
    btn_ejecutar.configure(state="disabled", fg_color="#555555")

    for ruta, info in datos_analisis.items():
        nombre_sin_ext = os.path.splitext(os.path.basename(ruta))[0]
        nuevo_titulo = f"[Dwarf] {nombre_sin_ext.replace('MrX', 'arnolddwarf')}"
        
        is_mp4 = ruta.lower().endswith('.mp4')
        if is_mp4:
            ruta_mkv = os.path.splitext(ruta)[0] + ".mkv"
            comando = [mkvmerge_path, "-o", ruta_mkv, "--title", nuevo_titulo]
        else:
            comando = [mkvpropedit_path, ruta, "--set", f"title={nuevo_titulo}"]
        
        a_count, s_count = 1, 1
        for track in info.get('tracks', []):
            t_type = track['type']
            track_id = track.get('id', 0)
            if t_type == "video":
                if is_mp4:
                    comando.extend(["--track-name", f"{track_id}:"])
                else:
                    comando.extend(["--edit", "track:v1", "--set", "name="])
            elif t_type in ["audio", "subtitles"]:
                nombre_idioma = identificar_idioma_inteligente(track)
                prefix = "a" if t_type == "audio" else "s"
                idx = a_count if t_type == "audio" else s_count
                
                detalles = ""
                if t_type == "subtitles":
                    if track['properties'].get('forced_track'):
                        detalles += " (Forzados)"
                    
                    # Detectar si es SDH / CC
                    t_name = str(track['properties'].get('track_name', '')).lower()
                    is_sdh = track['properties'].get('hearing_impaired_track') or "sdh" in t_name or "cc" in t_name
                    if is_sdh:
                        detalles += " (SDH)"
                
                nombre_final = f"[Dwarf] {nombre_idioma}{detalles}"
                
                if is_mp4:
                    comando.extend(["--track-name", f"{track_id}:{nombre_final}"])
                else:
                    comando.extend(["--edit", f"track:{prefix}{idx}", "--set", f"name={nombre_final}"])
                
                if t_type == "audio": a_count += 1
                else: s_count += 1

        if is_mp4:
            comando.append(ruta)

        try:
            subprocess.run(comando, check=True, capture_output=True, encoding="utf-8", startupinfo=si)
            if is_mp4:
                try:
                    os.remove(ruta)
                    agregar_log(f"  [Éxito] -> {os.path.basename(ruta)}: Convertido a MKV y limpiado", "OK")
                except Exception as ex_del:
                    agregar_log(f"  [Aviso] -> {os.path.basename(ruta)}: Convertido a MKV (error al borrar original: {str(ex_del)})", "WARN")
            else:
                agregar_log(f"  [Éxito] -> {os.path.basename(ruta)}: Limpieza completada con éxito", "OK")
        except Exception as e:
            agregar_log(f"  [Error] -> {os.path.basename(ruta)}: {str(e)}", "ERROR")
            
    agregar_log("PROCESO TERMINADO", "FIN")
    messagebox.showinfo("Éxito", "Proceso completado.")
    archivos_seleccionados.clear()

def sel_archivos():
    global archivos_seleccionados
    archivos = filedialog.askopenfilenames(filetypes=[("Videos", "*.mkv *.mp4"), ("Todos", "*.*")])
    if archivos:
        archivos_seleccionados = list(archivos)
        log_text.delete('1.0', tk.END)
        agregar_log(f"{len(archivos_seleccionados)} cargados.", "LOAD")

def sel_carpeta():
    global archivos_seleccionados
    carpeta = filedialog.askdirectory()
    if carpeta:
        archivos_seleccionados = [os.path.join(carpeta, f) for f in os.listdir(carpeta) if f.lower().endswith((".mkv", ".mp4"))]
        log_text.delete('1.0', tk.END)
        agregar_log(f"{len(archivos_seleccionados)} encontrados.", "LOAD")

# --- INTERFAZ ---
root = ctk.CTk()
root.title("Dwarf MKV Tool v5.2")
centrar_ventana(root, 850, 750)

ctk.CTkLabel(root, text="Dwarf MKV Metadata Tool", font=("Segoe UI", 28, "bold"), text_color="#e94560").pack(pady=20)
frame_btns = ctk.CTkFrame(root, fg_color="transparent")
frame_btns.pack()
ctk.CTkButton(frame_btns, text="📁 Archivos", command=sel_archivos, width=190).pack(side=tk.LEFT, padx=10)
ctk.CTkButton(frame_btns, text="📂 Carpeta", command=sel_carpeta, width=190).pack(side=tk.LEFT, padx=10)
ctk.CTkButton(root, text="🔍 ANALIZAR", command=analizar_archivos, fg_color="#e67e22", width=400).pack(pady=15)
log_text = tk.Text(root, height=18, width=95, bg="#0a0a1a", fg="#0be881", font=("Consolas", 10), padx=15, pady=15)
log_text.pack(pady=10)
btn_ejecutar = ctk.CTkButton(root, text="🚀 INICIAR PROCESO", command=procesar_archivos, state="disabled", height=55, width=400)
btn_ejecutar.pack(pady=20)
root.mainloop()