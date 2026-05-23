import os
import requests
import re
import webbrowser
import subprocess
import json
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True

# === CONFIGURACIÓN ===
API_KEY = "c8e18ea693ca2bb3e195a6e0e9c43570"
BASE_URL = "https://api.themoviedb.org/3"

cache_serie = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/seleccionar', methods=['GET'])
def seleccionar():
    try:
        import tkinter as tk
        from tkinter import filedialog
        
        # Inicializar y ocultar ventana de Tkinter para usar su diálogo nativo
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        
        tipos = [("Videos", "*.mp4 *.mkv *.avi *.ts *.mov"), ("Todos", "*.*")]
        files = filedialog.askopenfilenames(title="Selecciona archivos de video", filetypes=tipos)
        
        root.destroy()
        return jsonify({
            'status': 'success',
            'files': list(files)
        })
    except Exception as e:
        # Fallback para entornos sin GUI (como Docker)
        data_dir = "/data"
        if os.path.exists(data_dir):
            files = []
            for root_dir, _, filenames in os.walk(data_dir):
                for f in filenames:
                    if f.lower().endswith((".mp4", ".mkv", ".avi", ".ts", ".mov")):
                        files.append(os.path.join(root_dir, f))
            # Ordenar archivos para consistencia
            files.sort()
            return jsonify({
                'status': 'success',
                'files': files
            })
        return jsonify({
            'status': 'error',
            'message': f"No se pudo abrir el selector de archivos nativo y la carpeta '/data' no existe. Detalle: {str(e)}"
        }), 500

@app.route('/api/buscar', methods=['POST'])
def buscar():
    data = request.get_json() or {}
    query = data.get('query')
    tipo = data.get('tipo', 'tv') # 'tv' o 'movie'
    idioma = data.get('idioma', 'es-ES')
    
    if not query:
        return jsonify({'status': 'error', 'message': 'Falta el término de búsqueda'}), 400
        
    endpoint = "/search/tv" if tipo == "tv" else "/search/movie"
    url = f"{BASE_URL}{endpoint}"
    
    try:
        r = requests.get(url, params={
            'api_key': API_KEY,
            'query': query,
            'language': idioma
        }).json()
        
        results = r.get('results', [])
        return jsonify({
            'status': 'success',
            'results': results
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/analizar', methods=['POST'])
def analizar():
    data = request.get_json() or {}
    tmdb_id = data.get('tmdb_id')
    tipo = data.get('tipo', 'tv')
    archivos = data.get('archivos', [])
    idioma = data.get('idioma', 'es-ES')
    
    if not tmdb_id or not archivos:
        return jsonify({'status': 'error', 'message': 'Faltan parámetros'}), 400
        
    plan = []
    global cache_serie
    
    for ruta_completa in archivos:
        nombre_original = os.path.basename(ruta_completa)
        ext = os.path.splitext(nombre_original)[1]
        nuevo_nombre = ""
        
        if tipo == "movie":
            # Obtener datos de la película
            url = f"{BASE_URL}/movie/{tmdb_id}"
            try:
                r = requests.get(url, params={'api_key': API_KEY, 'language': idioma}).json()
                if 'title' in r:
                    release_date = r.get('release_date', '')
                    year = f" ({release_date[:4]})" if release_date else ""
                    nuevo_nombre = f"{r['title']}{year}{ext}"
            except Exception as e:
                print(f"Error consultando película: {e}")
        else:
            # Obtener datos de la serie / episodio
            # Regex mejorado para capturar temporada y episodio
            match = None
            # Patrón 1: s01e02 o t01e02
            match = re.search(r'[sStT](\d+)[eE](\d+)', nombre_original)
            if not match:
                # Patrón 2: 1x02
                match = re.search(r'(\d+)[xX](\d+)', nombre_original)
                
            temp, ep = None, None
            if match:
                temp, ep = int(match.group(1)), int(match.group(2))
            else:
                # Fallback: Formato Anime / Secuencial (ej. High School of the Dead 01)
                # 1. Quitar la extensión
                nombre_sin_ext, _ = os.path.splitext(nombre_original)
                
                # 2. Limpiar etiquetas comunes de anime y video
                # Quitar hashes CRC32 en corchetes, ej. [3F2A1C90]
                nombre_limpio = re.sub(r'\[[a-fA-F0-9]{8}\]', '', nombre_sin_ext)
                # Quitar años, ej. (2010) o [2010]
                nombre_limpio = re.sub(r'[\(\[]\d{4}[\)\]]', '', nombre_limpio)
                # Quitar sufijos de versión, ej. v2, v3
                nombre_limpio = re.sub(r'(?i)v\d+\b', '', nombre_limpio)
                # Quitar resoluciones y metadatos comunes de video
                nombre_limpio = re.sub(r'(?i)\b(?:\d{3,4}p|x26[45]|h26[45]|10bit|bd|bluray|webrip|dual|sub_esp|castellano|latino)\b', '', nombre_limpio)
                
                # 3. Buscar todos los números de 1 a 3 dígitos no adyacentes a otros dígitos
                matches_nums = re.findall(r'(?<!\d)\d{1,3}(?!\d)', nombre_limpio)
                
                if matches_nums:
                    temp = 1
                    ep = int(matches_nums[-1])
                    
            if temp is not None and ep is not None:
                try:
                    # Obtener nombre de la serie con caché usando idioma
                    cache_key = f"{tmdb_id}_{idioma}"
                    if cache_key not in cache_serie:
                        r_s = requests.get(f"{BASE_URL}/tv/{tmdb_id}", params={'api_key': API_KEY, 'language': idioma}).json()
                        cache_serie[cache_key] = r_s.get('name', 'Serie')
                    
                    # Detalles del episodio
                    r_e = requests.get(f"{BASE_URL}/tv/{tmdb_id}/season/{temp}/episode/{ep}", 
                                      params={'api_key': API_KEY, 'language': idioma}).json()
                    
                    # Obtener nombre de episodio de TMDB si existe, o usar un nombre genérico
                    nombre_episodio = r_e.get('name') or f"Episodio {ep}"
                    nuevo_nombre = f"{cache_serie[cache_key]} - S{str(temp).zfill(2)}E{str(ep).zfill(2)} - {nombre_episodio}{ext}"
                except Exception as e:
                    print(f"Error consultando episodio S{temp}E{ep}: {e}")
                    
        plan.append({
            'ruta_original': ruta_completa,
            'nombre_original': nombre_original,
            'nombre_nuevo': nuevo_nombre if nuevo_nombre else None
        })
        
    return jsonify({
        'status': 'success',
        'plan': plan
    })

@app.route('/api/renombrar', methods=['POST'])
def renombrar():
    data = request.get_json() or {}
    plan = data.get('plan', [])
    
    if not plan:
        return jsonify({'status': 'error', 'message': 'No hay datos de renombrado'}), 400
        
    resultados = []
    exitos = 0
    for item in plan:
        ruta_vieja = item.get('ruta_original')
        nombre_nuevo = item.get('nombre_nuevo')
        
        if not ruta_vieja or not nombre_nuevo:
            resultados.append({
                'ruta_original': ruta_vieja,
                'status': 'error',
                'error': 'Ruta original o nombre nuevo no especificado'
            })
            continue
            
        try:
            # Limpiar caracteres prohibidos en nombres de archivos
            nombre_nuevo_limpio = "".join([c for c in nombre_nuevo if c not in '<>:"/\\|?*'])
            ruta_nueva = os.path.join(os.path.dirname(ruta_vieja), nombre_nuevo_limpio)
            os.rename(ruta_vieja, ruta_nueva)
            exitos += 1
            resultados.append({
                'ruta_original': ruta_vieja,
                'ruta_nueva': ruta_nueva,
                'status': 'success'
            })
        except Exception as e:
            print(f"Error renombrando {ruta_vieja}: {e}")
            resultados.append({
                'ruta_original': ruta_vieja,
                'status': 'error',
                'error': str(e)
            })
            
    return jsonify({
        'status': 'success',
        'exitos': exitos,
        'resultados': resultados
    })

# --- CONFIGURACIÓN PARA METADATOS (MKVTOOLNIX) ---
import platform
is_windows = platform.system() == 'Windows'

if is_windows:
    MKVMERGE_PATH = r"C:\Program Files\MKVToolNix\mkvmerge.exe"
    MKVPROPEDIT_PATH = r"C:\Program Files\MKVToolNix\mkvpropedit.exe"
    # Ocultar consola en Windows para subprocesos
    si_meta = subprocess.STARTUPINFO()
    si_meta.dwFlags |= subprocess.STARTF_USESHOWWINDOW
else:
    MKVMERGE_PATH = "mkvmerge"
    MKVPROPEDIT_PATH = "mkvpropedit"
    si_meta = None

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

@app.route('/api/limpiador/seleccionar', methods=['GET'])
def limpiador_seleccionar():
    tipo = request.args.get('tipo', 'files') # 'files' o 'folder'
    try:
        import tkinter as tk
        from tkinter import filedialog
        
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        
        archivos = []
        if tipo == 'files':
            tipos = [("Videos MKV/MP4", "*.mkv *.mp4"), ("Todos", "*.*")]
            files = filedialog.askopenfilenames(title="Selecciona archivos de video", filetypes=tipos)
            archivos = list(files)
        else:
            folder = filedialog.askdirectory(title="Selecciona carpeta con archivos de video")
            if folder:
                archivos = [os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith((".mkv", ".mp4"))]
                
        root.destroy()
        return jsonify({
            'status': 'success',
            'files': archivos
        })
    except Exception as e:
        # Fallback para entornos sin GUI (como Docker)
        data_dir = "/data"
        if os.path.exists(data_dir):
            archivos = []
            for root_dir, _, filenames in os.walk(data_dir):
                for f in filenames:
                    if f.lower().endswith((".mkv", ".mp4")):
                        archivos.append(os.path.join(root_dir, f))
            archivos.sort()
            return jsonify({
                'status': 'success',
                'files': archivos
            })
        return jsonify({
            'status': 'error',
            'message': f"No se pudo abrir el selector de archivos nativo y la carpeta '/data' no existe. Detalle: {str(e)}"
        }), 500

@app.route('/api/limpiador/analizar', methods=['POST'])
def limpiador_analizar():
    import shutil
    if not shutil.which(MKVMERGE_PATH):
        return jsonify({
            'status': 'error',
            'message': f"MKVToolNix (mkvmerge) no está instalado o no se encuentra en el PATH. Instálalo para usar esta herramienta."
        }), 400

    data = request.get_json() or {}
    archivos = data.get('archivos', [])
    
    if not archivos:
        return jsonify({'status': 'error', 'message': 'No se especificaron archivos'}), 400
        
    datos_analisis = {}
    logs = []
    
    for ruta in archivos:
        if not os.path.exists(ruta):
            continue
            
        try:
            resultado = subprocess.run(
                [MKVMERGE_PATH, "-J", ruta], 
                capture_output=True, text=True, encoding="utf-8", 
                check=True, startupinfo=si_meta
            )
            info = json.loads(resultado.stdout)
            datos_analisis[ruta] = info
            
            logs.append({'mensaje': f"ARCHIVO: {os.path.basename(ruta)}", 'tipo': 'FILE'})
            for track in info.get('tracks', []):
                if track['type'] in ['audio', 'subtitles']:
                    t_type = "Audio" if track['type'] == 'audio' else "Sub"
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
                    logs.append({
                        'mensaje': f"  [{t_type}] -> {nombre_res}{detalles} ({l_code})",
                        'tipo': 'INFO'
                    })
        except Exception as e:
            logs.append({'mensaje': f"Error analizando {os.path.basename(ruta)}: {str(e)}", 'tipo': 'ERROR'})
            
    return jsonify({
        'status': 'success',
        'datos_analisis': datos_analisis,
        'logs': logs
    })

@app.route('/api/limpiador/procesar', methods=['POST'])
def limpiador_procesar():
    import shutil
    if not shutil.which(MKVPROPEDIT_PATH) or not shutil.which(MKVMERGE_PATH):
        return jsonify({
            'status': 'error',
            'message': "MKVToolNix (mkvmerge o mkvpropedit) no está instalado o no se encuentra en el PATH. Instálalo para usar esta herramienta."
        }), 400

    data = request.get_json() or {}
    datos_analisis = data.get('datos_analisis', {})
    
    if not datos_analisis:
        return jsonify({'status': 'error', 'message': 'No hay datos de análisis para procesar'}), 400
        
    logs = []
    exitos = 0
    
    for ruta, info in datos_analisis.items():
        if not os.path.exists(ruta):
            logs.append({'mensaje': f"Archivo no encontrado: {os.path.basename(ruta)}", 'tipo': 'ERROR'})
            continue
            
        nombre_sin_ext = os.path.splitext(os.path.basename(ruta))[0]
        nuevo_titulo = f"[Dwarf] {nombre_sin_ext.replace('MrX', 'arnolddwarf')}"
        
        is_mp4 = ruta.lower().endswith('.mp4')
        if is_mp4:
            ruta_mkv = os.path.splitext(ruta)[0] + ".mkv"
            comando = [MKVMERGE_PATH, "-o", ruta_mkv, "--title", nuevo_titulo]
        else:
            comando = [MKVPROPEDIT_PATH, ruta, "--set", f"title={nuevo_titulo}"]
        
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
                
                if t_type == "audio":
                    a_count += 1
                else:
                    s_count += 1
                    
        if is_mp4:
            comando.append(ruta)

        try:
            subprocess.run(comando, check=True, capture_output=True, encoding="utf-8", startupinfo=si_meta)
            if is_mp4:
                try:
                    os.remove(ruta)
                    logs.append({'mensaje': f"  [Éxito] -> {os.path.basename(ruta)}: Convertido a MKV y limpiado", 'tipo': 'OK'})
                except Exception as ex_del:
                    logs.append({'mensaje': f"  [Aviso] -> {os.path.basename(ruta)}: Convertido a MKV (error al borrar original: {str(ex_del)})", 'tipo': 'WARN'})
            else:
                logs.append({'mensaje': f"  [Éxito] -> {os.path.basename(ruta)}: Limpieza completada con éxito", 'tipo': 'OK'})
            exitos += 1
        except Exception as e:
            logs.append({'mensaje': f"  [Error] -> {os.path.basename(ruta)}: {str(e)}", 'tipo': 'ERROR'})
            
    logs.append({'mensaje': "PROCESO TERMINADO", 'tipo': 'FIN'})
    return jsonify({
        'status': 'success',
        'exitos': exitos,
        'logs': logs
    })

if __name__ == '__main__':
    # Detectar si estamos corriendo dentro de un contenedor Docker
    is_docker = os.path.exists('/.dockerenv')
    
    host = '0.0.0.0' if is_docker else '127.0.0.1'
    
    # Solo abrir el navegador automáticamente si no estamos en Docker
    if not is_docker:
        webbrowser.open(f"http://127.0.0.1:5000")
        
    # Ejecutar la aplicación Flask. Desactivamos multi-threading para evitar colisiones de hilos con Tkinter si se ejecuta de forma nativa.
    app.run(host=host, port=5000, debug=False, threaded=False)