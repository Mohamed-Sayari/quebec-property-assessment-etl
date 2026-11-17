# 1. Analyse des données — Rôles d'évaluation foncière du Québec

## 1.1 Présentation générale du jeu de données
Le jeu de données des rôles d'évaluation foncière du Québec est publié par le ministère des Affaires municipales et de l'Habitation (MAMH) sur Données Québec. Il décrit les propriétés immobilières (unités d'évaluation) des municipalités québécoises à des fins d'évaluation et de taxation municipale.

Le jeu comprend principalement :
- **Un fichier d'index CSV** (`code géographique`, `nom du territoire`, `lien`, `date de modification`) listant les municipalités et l'URL de leur fichier XML respectif.
- **Un fichier XML par municipalité** (plus de 1 130 municipalités au total à l'échelle du Québec), respectant le schéma officiel (`RL.xsd`, version `2.9` observée dans les fichiers 2026).
- **Des ressources complémentaires (hors périmètre principal)** : un jeu géoréférencé (FGDB / GeoPackage) contenant les localisations associées aux numéros de matricule, ainsi que la documentation officielle (*Répertoire des renseignements prescrits* et *Guide sur les données en format ouvert*).

### Sous-ensemble utilisé pour ce test
Conformément aux consignes (fichiers disponibles localement), l'analyse et les tests d'importation s'appuient sur :
- Le fichier d'index CSV 2026 pour la correspondance code géographique / nom de municipalité.
- Deux fichiers XML municipaux représentatifs :
  - `RM01042.xml` — **Grosse-Île** (code `01042`, millésime `2026`) : petite municipalité, idéale pour l'inspection manuelle et les tests rapides.
  - `RM02005.xml` — **Percé** (code `02005`, millésime `2026`) : municipalité plus étendue présentant une plus grande diversité de cas (terrains vacants, bâtiments commerciaux, répartitions fiscales, adresses multiples).

---

## 1.2 Structure hiérarchique des fichiers XML
Chaque fichier XML possède une racine `<RL>` contenant :
1. **Des métadonnées d'en-tête** :
   - `<VERSION>` : version du répertoire de transmission (ex. `2.9`).
   - `<RLM01A>` : code géographique de la municipalité sur 5 caractères (ex. `01042`).
   - `<RLM02A>` : millésime du rôle (ex. `2026`).
2. **Une liste de balises `<RLUEx>`** (1 bloc par unité d'évaluation), chacune organisée en 5 sections fonctionnelles :

| Section | Balises principales | Contenu métier | Cardinalité |
| :--- | :--- | :--- | :--- |
| **1. Identification** | `RL0101` (`RL0101x`), `RL0102A`, `RL0104` (`A`..`H`), `RL0105A`, `RL0106A`, `RL0107A` | Adresses civiques, arrondissement, numéro de matricule segmenté, code d'utilisation prédominante (CUBF), numéro de dossier, unité de voisinage | `1:1` sauf `RL0101x` (`1:N`) |
| **2. Propriétaire** | `RL0201` (`RL0201x`, `RL0201Gx`, `RL0201Hx`, `RL0201U`) | Date d'inscription au rôle, statut aux fins d'imposition scolaire (`1` ou `2`), conditions d'inscription (`1` à `9`) | `1:N` sur `RL0201x` |
| **3. Caractéristiques** | `RL0301A`..`RL0316A` | Frontage (`RL0301A`), superficie (`RL0302A`), zonage agricole (`RL0303A`), étages (`RL0306A`), année construction (`RL0307A`/`B`), logements (`RL0311A`), locaux non résidentiels (`RL0313A`) | `1:1` (toutes optionnelles) |
| **4. Valeurs** | `RL0401A`..`RL0405A` | Date de référence au marché (`RL0401A`), valeur terrain (`RL0402A`), bâtiment (`RL0403A`), immeuble total (`RL0404A`), rôle antérieur (`RL0405A`) | `1:1` |
| **5. Répartition fiscale** | `RL0501A`..`RL0503A`, `RL0504` (`RL0504x`), `RL0505A`, `RL0506x`, `RL0507` (`RL0507x`) | Terrain vague desservi, classes non résidentielles/industrielles, répartitions fiscales imposables/non imposables et références légales | `1:1` + `1:N` sur `RL0504x` / `RL0507x` |

---

## 1.3 Difficultés techniques et pièges d'exploitation identifiés

1. **Volumétrie et lecture en mémoire** :
   À l'échelle de la province, l'ensemble des rôles représente plusieurs millions d'unités d'évaluation et plusieurs gigaoctets de XML décompressé (les grandes villes comme Montréal ou Québec génèrent des fichiers de plusieurs centaines de mégaoctets). Charger un fichier entier en DOM en mémoire (`readFileSync`) provoquerait des erreurs de dépassement mémoire (`Out Of Memory`). **Solution** : parsing XML en **streaming** (SAX) unité par unité (`<RLUEx>`).

2. **Nomenclature codifiée et faible lisibilité directe** :
   Les balises XML (`RL0307A`, `RL0105A`, etc.) sont abstraites et nécessitent une table de correspondance rigoureuse basée sur le *Manuel d'évaluation foncière du Québec* (MEFQ) pour obtenir un modèle de base de données lisible et exploitable par des équipes produit, CRM ou IA.

3. **Cardinalités `1:N` imbriquées** :
   Une unité d'évaluation peut posséder :
   - `0` à `N` adresses civiques (`RL0101x`),
   - `1` à `N` inscriptions de statut de propriétaire (`RL0201x`),
   - `0` à `N` lignes de répartition fiscale (`RL0504x`, `RL0507x`).
   Une table plate unique entraînerait soit une perte d'information (ne garder que la première adresse), soit une duplication des valeurs foncières lors d'agrégations.

4. **Pièges de typage et zéros significatifs** :
   - Les segments du numéro de matricule (`RL0104A`=`0075`, `RL0104C`=`0100`) et le code géographique (`01042`) possèdent des zéros initiaux significatifs : ils doivent impérativement être stockés en **chaînes de caractères** (`VARCHAR`), jamais en entiers.
   - Le code de classe non résidentielle (`RL0502A`) accepte des valeurs alphanumériques (`1A` à `13`).
   - Les montants et superficies peuvent être absents ou décimaux (`RL0301A`, `RL0302A`).

5. **Forte présence de champs optionnels / manquants** :
   Comme observé dès les premiers enregistrements de `RM01042.xml`, un terrain sans bâtiment ne possède pas les balises `RL0306A..RL0313A` ni parfois `RL0403A`, et une adresse peut ne pas avoir de numéro civique (`RL0101Ax` absent). Les validateurs doivent gérer les valeurs nulles proprement sans rejeter des enregistrements valides.

6. **Clé d'unicité naturelle composite** :
   Aucun ID technique unique (UUID) n'est fourni par défaut sur `<RLUEx>`. L'unicité d'une unité d'évaluation dans un rôle donné repose sur la combinaison : `(municipality_code, roll_year, matricule_division, matricule_section, matricule_emplacement, building_number, unit_number, zone_number, discriminant)`.

7. **Anonymisation légale et jointure géographique** :
   Pour respecter la *Loi sur l'accès aux documents des organismes publics*, les noms/adresses des propriétaires et numéros de cadastre sont absents des fichiers XML ouverts. Toute application CRM doit exploiter les caractéristiques physiques, valeurs et adresses civiques, sans attendre de données nominatives directes. L'ajout ultérieur de coordonnées géographiques nécessite une jointure externe sur le numéro de matricule normalisé avec le jeu FGDB/GPKG.