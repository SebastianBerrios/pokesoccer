# Audio incluido y grabaciones pendientes

El checkout incluye 36 efectos originales de habilidades y un efecto de interfaz. **No incluye todavía la apertura latina, su instrumental ni las voces del anime.** No se presenta ningún efecto sintetizado como grabación del anime.

## Archivos funcionales

`apps/client/public/audio/*.wav` contiene PCM mono de 22.050 Hz, generado de forma determinista por `node --experimental-strip-types scripts/generate-audio.ts`. No contiene muestras externas. El navegador comprueba decodificación, duración, señal no nula y pico inferior a saturación de los 36 poderes.

En «Configurar sonido» hay volumen independiente de música, voces y efectos, silencio general y carga de archivos locales para sala, partido y cada especie. Los archivos quedan en IndexedDB del dispositivo; no se suben al servidor. Música de sala/partido usa bucles y una transición de 600 ms. Las voces se reemplazan entre sí y se solicitan al seleccionar una especie y preparar su especial. Los eventos repetidos o presentes al conectar no vuelven a reproducirse.

## Fuentes consultadas

| Fuente | Qué se verificó | Resultado |
| --- | --- | --- |
| [Tema De Pokémon — Apple Music](https://music.apple.com/us/song/tema-de-pok%C3%A9mon/1834061051) | Referencia solicitada del tema en español | Referencia identificada; no se obtuvo una grabación local completa |
| [Pokémon Theme latino — KaraokeMedia](https://store.karaokemedia.com/es/international/32274/pokemon/pokemon-theme-latino/) | Oferta de playback instrumental | No se compró ni descargó el archivo |
| [Pokémon Theme — versión instrumental](https://www.version-karaoke.es/playbacks/pokemon/pokemon-theme.html) | Otra fuente de instrumental | No se compró ni descargó el archivo |
| [Original Anime Cries for Cobblemon 1.0.0](https://modrinth.com/resourcepack/original-anime-cries-for-cobblemon/version/1.0.0) | Paquete descrito como voces del anime, primeras 649 especies | No cubre Greninja y no se pudo descargar ni auditar su audio |

La consulta HTTP desde Python a la API del paquete falló con `WinError 10013` (socket no permitido); la consulta con la herramienta Node también devolvió `fetch failed`. La búsqueda web pudo leer las páginas, pero eso no acredita disponer de los archivos. No hay un paquete completo validado ni auditoría auditiva de estas grabaciones.

Para completar el requisito original faltan obtener las dos pistas y las doce voces, comprobar su correspondencia y calidad mediante escucha, documentar las fuentes de cada archivo e incorporarlos al paquete local. La importación por el usuario funciona como alternativa mientras faltan esos recursos; no equivale a esa entrega.
