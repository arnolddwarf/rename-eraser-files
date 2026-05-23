FROM python:3.12-alpine

# Instalar MKVToolNix (incluye mkvmerge y mkvpropedit)
RUN apk add --no-cache mkvtoolnix

WORKDIR /app

# Copiar e instalar dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el resto del código
COPY . .

# Puerto expuesto por Flask
EXPOSE 5000

# Directorio de volumen para montar videos desde el host
VOLUME ["/data"]

# Ejecutar el servidor web local
CMD ["python", "app.py"]
