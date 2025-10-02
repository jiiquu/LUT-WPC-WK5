const geoDataURL='https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k&outputFormat=json&srsName=EPSG:4326';
const migrationURL = 'https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/muutl/statfin_muutl_pxt_11a2.px';

// Apufunktio JSON-fetchaukselle
async function fetchJSON(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// Hakee kaiken datan kerralla
async function fetchAllData() {
    const migrationBodyPromise = fetchJSON("./data/migration_query.json");
    const geoDataPromise = fetchJSON(geoDataURL);
    const migrationDataPromise = migrationBodyPromise.then((body) => 
        fetchJSON(migrationURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
        }) 
    );

    const [geoData, migrationRaw] = await Promise.all([
        geoDataPromise, 
        migrationDataPromise.catch(() => null) // Jos epäonnistuu, jatketaan ilman
    ]);
    const migration = parseMigrationData(migrationRaw);
    return { geoData, migration};
}
// Käynnistää prosessit, kun DOM on valmis
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const { geoData, migration } = await fetchAllData();
        initMap(geoData, migration);
    } catch (err) {
        console.error("Data loading failed:", err);
        const el = document.getElementById("map");
    if (el) {
        el.innerHTML = '<div style="padding:12px;border:1px solid #ccc;border-radius:8px;">Failed to load data. Please try again later.</div>';
    }
    }
 });

 // Lisää globaalin virheenkäsittelijän
/*  window.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  console.error("Unhandled promise rejection:", e.reason);
}); */

// Kunnan koodin muunnos kolmikirjaimiseksi
function toMunicipalityCode(kuntaVal) {

  return String(kuntaVal ?? "").slice(-3).padStart(3, "0");
}

// Värin määritys muuttoliikkeen perusteella
/* function Colorize(mig) {
  if (!mig) return "#666666ff";

  const positive = Math.max(0, mig.vm43_tulo ?? 0);
  const negative = Math.max(0, mig.vm43_lahto ?? 0);


  if (positive === 0 && negative === 0) return "#666666ff";
  const ratio = negative === 0 ? Infinity : positive / negative;

  // (positive/negative)^3 * 60, max 120
  let hue = Math.pow(ratio, 3) * 60;
  if (!Number.isFinite(hue)) hue = 120;
  hue = Math.min(120, hue);

  return `hsl(${hue}, 75%, 50%)`;
} */
// Kartan tyylin asettaminen
/* function styleByMigration(migrationData) {
  return function (feature) {
    const props = feature.properties ?? {};
    const code = toMunicipalityCode(props.kunta);
    const mig = code ? migrationData[code] : null;

    return {
      color: "#333",
      weight: 1,
      fillOpacity: 0.7,
      fillColor: Colorize(mig)
    };
  };
} */

// Alustaa kartan lisäämällä layerin ja pohjakartan ja kohdistamalla näkymän
const initMap = (geoData, migration) => {
    
    let map = L.map('map', {
        minZoom: -3
    })
    let geoJson = L.geoJSON(geoData, {
        weight: 2,
        onEachFeature: (feature, layer) => getInfo(feature, layer, migration),
//        style: styleByMigration(migration)
    }).addTo(map)

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap"
    }).addTo(map);
    map.fitBounds(geoJson.getBounds())
    
    
    
}

// Lisää tooltipin ja popupin layeriin
const getInfo = (feature, layer, migration) => {
    const nimi = feature.properties.nimi;
    layer.bindTooltip(nimi);

    const code = toMunicipalityCode(feature.properties.kunta);
    const data = migration[code];

  if (data) {
    layer.bindPopup(`
      <strong>${nimi}</strong><br>
      In-migration: ${data.vm43_tulo}<br>
      Out-migration: ${data.vm43_lahto}<br>
      Net migration: ${data.vm43_netto}
    `);
  }

}
// Parsii muuttoliikedatan
const parseMigrationData = (response) => {
    
/*     if (!response || !response.dimension || !response.value) {
            console.error("Invalid migration data response:", response);
            return {};
        } */

    const { dimension, value } = response;
    const municipalities = dimension.Alue.category.index;
    const migrationTypes = Object.keys(dimension.Tiedot.category.index);
    const result = {};
    const numTypes = migrationTypes.length;

    for (const [code, position] of Object.entries(municipalities)) {
        const shortCode = toMunicipalityCode(code);
        const start = position * numTypes;
        result[shortCode] = {};

        migrationTypes.forEach((type, i) => {
            result[shortCode][type] = value[start + i];
        });
    }

    return result;
}
