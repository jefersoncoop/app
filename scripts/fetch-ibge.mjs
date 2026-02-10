import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchIBGEData() {
    console.log("Fetching IBGE municipality data...");
    try {
        const response = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios");
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        const citiesMap = {};
        const statesCitiesMap = {};

        console.log(`Processing ${data.length} cities...`);

        data.forEach(item => {
            // Correct path based on IBGE API structure for /municipios
            const uf = item.regiao?.uf?.sigla || item.microrregiao?.mesorregiao?.UF?.sigla;
            const cityName = item.nome;
            const ibgeCode = item.id.toString();

            if (uf && cityName) {
                const normalizedCity = cityName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                // 1. Map for CRM sync (UF-CityName -> Code)
                const crmKey = `${uf}-${normalizedCity}`;
                citiesMap[crmKey] = ibgeCode;

                // 2. Map for UI (UF -> [CITY1, CITY2, ...])
                if (!statesCitiesMap[uf]) statesCitiesMap[uf] = [];
                statesCitiesMap[uf].push(cityName.toUpperCase());
            }
        });

        // Sort cities alphabetically for each state
        Object.keys(statesCitiesMap).forEach(uf => {
            statesCitiesMap[uf].sort();
        });

        const dataDir = path.join(__dirname, '../src/data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Save CRM mapping
        const crmOutputPath = path.join(dataDir, 'ibge-cities.json');
        fs.writeFileSync(crmOutputPath, JSON.stringify(citiesMap, null, 2));

        // Save UI mapping
        const uiOutputPath = path.join(dataDir, 'ibge-states-cities.json');
        fs.writeFileSync(uiOutputPath, JSON.stringify(statesCitiesMap, null, 2));

        console.log(`Successfully saved ${Object.keys(citiesMap).length} cities.`);
        console.log(`CRM Data: ${crmOutputPath}`);
        console.log(`UI Data: ${uiOutputPath}`);
    } catch (error) {
        console.error("Failed to fetch IBGE data:", error);
        process.exit(1);
    }
}

fetchIBGEData();
