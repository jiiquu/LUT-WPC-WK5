// Hakee geoDatan
const fetchData = async () => {
    const response = await fetch('https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k&outputFormat=json&srsName=EPSG:4326');
    const geoData = await response.json();

    const migrationDataResponse = await fetchMigrationData();
    const parsedMigration = parseMigrationData(migrationDataResponse);
    initMap(geoData, parsedMigration);
    
}


const fetchMigrationData = async () => {
    try {
        const migrationURL = 'https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/muutl/statfin_muutl_pxt_11a2.px';
        const migrationBody = await (await fetch("./data/migration_query.json")).json();
        const response = await fetch(migrationURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(migrationBody)
        });

        const result = await response.json();
        
        return result;
    } catch (error) {
        console.error("Failed to fetch migration data:", error);
        return null;
    }
};

function toMunicipalityCode(kuntaVal) {

  return String(kuntaVal ?? "").slice(-3).padStart(3, "0");
}

// Colorize based on migration ratio
function Colorize(mig) {
  if (!mig) return "#666666ff";

  const positive = Math.max(0, mig.vm43_tulo ?? 0);
  const negative = Math.max(0, mig.vm43_lahto ?? 0);


  if (positive === 0 && negative === 0) return "#666666ff";
  const ratio = negative === 0 ? Infinity : positive / negative;

  // (positive/negative)^3 * 60, max 120
  let hue = Math.pow(ratio, 3) * 60;
  if (!Number.isFinite(hue)) hue = 120;   // Infinity -> max green
  hue = Math.min(120, hue);

  return `hsl(${hue}, 75%, 50%)`;
}

function styleByMigration(migrationData) {
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
}

// Initialize the map
const initMap = (geoData, migrationData) => {
    
//    const mig = migrationData[code];
    let map = L.map('map', {
        minZoom: -3
    })
    let geoJson = L.geoJSON(geoData, {
        weight: 2,
        onEachFeature: (feature, layer) => getInfo(feature, layer, migrationData),
        style: styleByMigration(migrationData)
    }).addTo(map)

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap"
    }).addTo(map);
    map.fitBounds(geoJson.getBounds())
    
    
    
}
fetchData();

const getInfo = (feature, layer, migrationData) => {
    const nimi = feature.properties.nimi;
    layer.bindTooltip(nimi);

    const code = toMunicipalityCode(feature.properties.kunta);
    const data = migrationData[code];

  if (data) {
    layer.bindPopup(`
      <strong>${nimi}</strong><br>
      In-migration: ${data.vm43_tulo}<br>
      Out-migration: ${data.vm43_lahto}<br>
      Net migration: ${data.vm43_netto}
    `);
  }

}
const parseMigrationData = (response) => {
    
    if (!response || !response.dimension || !response.value) {
            console.error("Invalid migration data response:", response);
            return {};
        }

    const { dimension, value } = response;
    const municipalities = dimension.Alue.category.index;
    const migrationTypes = Object.keys(dimension.Tiedot.category.index);
    const result = {};
    const numTypes = migrationTypes.length;

    for (const [code, position] of Object.entries(municipalities)) {
        const shortCode = code.slice(-3);
        const start = position * numTypes;
        result[shortCode] = {};

        migrationTypes.forEach((type, i) => {
            result[shortCode][type] = value[start + i];
        });
    }

    return result;
}
