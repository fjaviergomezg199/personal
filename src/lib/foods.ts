import type { CustomFood, Macros } from '../store/types';
import { fold } from './quickParse';

/**
 * Base de datos de alimentos habituales en España. Valores aproximados por
 * 100 g (o 100 ml), con los hidratos sin fibra, como en las etiquetas de la UE.
 * [clave, nombre, kcal, proteína, hidratos, grasa, sinónimos, ración por defecto (g), unidades]
 */
type Row = [string, string, number, number, number, number, string[], number, Record<string, number>?];

const ROWS: Row[] = [
  // Cereales, pan, pasta y tubérculos
  ['arroz', 'Arroz (crudo)', 360, 7, 79, 0.6, ['arroz', 'arroz blanco', 'arroz crudo', 'arroz basmati', 'arroz redondo', 'arroz largo', 'arroz vaporizado'], 70],
  ['arroz-cocido', 'Arroz cocido', 130, 2.7, 28, 0.3, ['arroz cocido', 'arroz hervido', 'arroz blanco cocido'], 200, { plato: 200 }],
  ['arroz-integral', 'Arroz integral (crudo)', 355, 7.5, 73, 2.7, ['arroz integral'], 70],
  ['pasta', 'Pasta (cruda)', 360, 12.5, 72, 1.5, ['pasta', 'macarrones', 'espaguetis', 'spaghetti', 'fideos', 'tallarines', 'penne', 'lacitos', 'helices', 'pasta seca', 'tortellini'], 80],
  ['pasta-cocida', 'Pasta cocida', 158, 5.8, 31, 0.9, ['pasta cocida', 'macarrones cocidos', 'espaguetis cocidos'], 200, { plato: 220 }],
  ['pasta-integral', 'Pasta integral (cruda)', 348, 13.5, 64, 2.5, ['pasta integral', 'macarrones integrales', 'espaguetis integrales'], 80],
  ['pan', 'Pan blanco', 270, 9, 54, 1.6, ['pan', 'pan blanco', 'barra de pan', 'baguette', 'pan de barra', 'bocadillo', 'tostada', 'tostadas', 'pan tostado', 'picos', 'regañas'], 40, { rebanada: 30, tostada: 30, barra: 250, bocadillo: 100, unidad: 30 }],
  ['pan-integral', 'Pan integral', 250, 10, 44, 3.5, ['pan integral', 'tostada integral', 'tostadas integrales', 'pan de centeno', 'pan multicereales', 'pan de espelta'], 40, { rebanada: 30, tostada: 30, unidad: 30 }],
  ['pan-molde', 'Pan de molde', 265, 8.5, 48, 4, ['pan de molde', 'pan bimbo'], 50, { rebanada: 25, unidad: 25 }],
  ['pan-molde-integral', 'Pan de molde integral', 245, 10, 41, 4, ['pan de molde integral'], 50, { rebanada: 27, unidad: 27 }],
  ['avena', 'Copos de avena', 372, 13.5, 59, 7, ['avena', 'copos de avena', 'harina de avena', 'porridge', 'gachas de avena'], 40, { cucharada: 10, puñado: 30 }],
  ['cereales', 'Cereales de desayuno', 375, 7, 84, 1, ['cereales', 'copos de maiz', 'corn flakes', 'cereales de desayuno'], 30, { taza: 30, bol: 40 }],
  ['muesli', 'Muesli', 365, 9.5, 63, 6, ['muesli', 'granola'], 40, { bol: 50 }],
  ['harina', 'Harina de trigo', 345, 10, 72, 1.2, ['harina', 'harina de trigo'], 30, { cucharada: 10 }],
  ['cuscus', 'Cuscús (seco)', 360, 12.8, 72, 0.6, ['cuscus'], 70],
  ['quinoa', 'Quinoa (cruda)', 365, 14, 58, 6, ['quinoa', 'quinua'], 70],
  ['quinoa-cocida', 'Quinoa cocida', 120, 4.4, 20, 1.9, ['quinoa cocida'], 180],
  ['tortitas-arroz', 'Tortitas de arroz', 385, 8, 81, 2.8, ['tortitas de arroz', 'tortita de arroz', 'tortitas de maiz', 'tortitas'], 16, { unidad: 8 }],
  ['tortilla-trigo', 'Tortilla de trigo (wrap)', 300, 8.5, 50, 7, ['tortilla de trigo', 'wrap', 'tortillas de trigo', 'fajita'], 40, { unidad: 40 }],
  ['galletas-maria', 'Galletas María', 440, 7, 74, 12, ['galletas maria', 'galleta maria'], 30, { unidad: 6, galleta: 6 }],
  ['galletas', 'Galletas', 480, 7, 63, 21, ['galletas', 'galleta', 'galletas digestive', 'galletas integrales'], 30, { unidad: 15, galleta: 15 }],
  ['biscotes', 'Biscotes', 400, 11, 72, 6, ['biscotes', 'biscote', 'tostadas de paquete'], 24, { unidad: 8 }],
  ['patata', 'Patata', 77, 2, 17, 0.1, ['patata', 'patatas', 'papa', 'papas', 'patata cocida', 'patatas cocidas', 'patata al horno'], 200, { unidad: 150 }],
  ['boniato', 'Boniato', 86, 1.6, 20, 0.1, ['boniato', 'batata'], 200, { unidad: 200 }],
  ['patatas-fritas', 'Patatas fritas', 535, 6.5, 50, 34, ['patatas fritas', 'patatas de bolsa', 'chips'], 30, { bolsa: 40 }],
  // Legumbres
  ['lentejas', 'Lentejas (crudas)', 330, 24, 50, 1.5, ['lentejas', 'lenteja', 'lentejas rojas', 'lentejas pardinas'], 70],
  ['lentejas-cocidas', 'Lentejas cocidas', 116, 9, 18, 0.4, ['lentejas cocidas', 'lentejas de bote'], 250, { plato: 250 }],
  ['potaje', 'Lentejas o potaje guisado', 120, 6.5, 13, 4.5, ['lentejas guisadas', 'potaje', 'lentejas con chorizo', 'cocido', 'fabada'], 300, { plato: 300 }],
  ['garbanzos', 'Garbanzos (crudos)', 340, 19, 50, 6, ['garbanzos', 'garbanzo'], 70],
  ['garbanzos-cocidos', 'Garbanzos cocidos', 130, 7.2, 17, 2.6, ['garbanzos cocidos', 'garbanzos de bote'], 200, { bote: 250, plato: 250 }],
  ['alubias', 'Alubias (crudas)', 300, 22, 45, 1.5, ['alubias', 'judias blancas', 'judiones', 'frijoles'], 70],
  ['alubias-cocidas', 'Alubias cocidas', 110, 7.5, 15, 0.5, ['alubias cocidas', 'alubias de bote'], 200, { bote: 250 }],
  ['guisantes', 'Guisantes', 80, 5.4, 9.5, 0.4, ['guisantes', 'guisante'], 100],
  ['hummus', 'Hummus', 200, 7, 12, 14, ['hummus', 'humus'], 50, { cucharada: 20 }],
  ['tofu', 'Tofu', 140, 15, 2, 8.5, ['tofu'], 100],
  ['soja-texturizada', 'Soja texturizada', 340, 50, 18, 1.5, ['soja texturizada', 'heura'], 50],
  // Carne
  ['pollo', 'Pechuga de pollo', 110, 23, 0, 1.5, ['pollo', 'pechuga', 'pechuga de pollo', 'pechugas de pollo', 'filete de pollo', 'pollo a la plancha', 'tiras de pollo'], 150, { filete: 120, pechuga: 200, unidad: 200 }],
  ['muslo-pollo', 'Muslo de pollo (sin piel)', 125, 19.5, 0, 5, ['muslo de pollo', 'contramuslo', 'contramuslos', 'muslos de pollo'], 150, { unidad: 100 }],
  ['pollo-asado', 'Pollo asado (con piel)', 215, 25, 0, 13, ['pollo asado'], 150],
  ['pavo', 'Pechuga de pavo', 105, 23.5, 0, 1, ['pavo', 'pechuga de pavo', 'filete de pavo'], 150, { filete: 120 }],
  ['fiambre-pavo', 'Fiambre de pavo', 100, 18, 2.5, 2, ['fiambre de pavo', 'pavo en lonchas', 'pechuga de pavo en lonchas', 'lonchas de pavo'], 50, { loncha: 10 }],
  ['ternera', 'Ternera magra', 131, 21, 0, 5, ['ternera', 'filete de ternera', 'carne de ternera', 'solomillo de ternera', 'carne', 'añojo'], 150, { filete: 130 }],
  ['carne-picada', 'Carne picada', 230, 18, 0, 17.5, ['carne picada', 'picada', 'albondigas'], 125],
  ['hamburguesa', 'Hamburguesa de carne', 230, 17, 1, 18, ['hamburguesa', 'hamburguesas'], 110, { unidad: 110 }],
  ['lomo', 'Lomo de cerdo', 140, 21, 0, 6, ['lomo', 'lomo de cerdo', 'cinta de lomo', 'cerdo', 'chuleta de cerdo', 'chuletas'], 150, { filete: 100 }],
  ['solomillo-cerdo', 'Solomillo de cerdo', 120, 21, 0, 4, ['solomillo', 'solomillo de cerdo'], 150],
  ['jamon-serrano', 'Jamón serrano', 240, 31, 0.5, 13, ['jamon', 'jamon serrano', 'jamon curado'], 40, { loncha: 15 }],
  ['jamon-iberico', 'Jamón ibérico', 375, 30, 0.5, 28, ['jamon iberico', 'paleta iberica'], 40, { loncha: 15 }],
  ['jamon-cocido', 'Jamón cocido', 105, 18, 1.5, 3, ['jamon cocido', 'jamon york', 'jamon de york'], 50, { loncha: 15 }],
  ['chorizo', 'Chorizo', 455, 24, 2, 39, ['chorizo', 'salchichon', 'fuet', 'longaniza'], 30, { rodaja: 5 }],
  ['salchichas', 'Salchichas', 270, 12, 2, 24, ['salchichas', 'salchicha', 'salchichas frankfurt'], 80, { unidad: 40 }],
  ['bacon', 'Bacon', 380, 14, 1, 36, ['bacon', 'beicon', 'panceta'], 30, { loncha: 15 }],
  ['cordero', 'Cordero', 230, 18, 0, 17, ['cordero', 'chuletillas de cordero'], 150],
  // Pescado y marisco
  ['merluza', 'Merluza', 85, 17.5, 0, 1.8, ['merluza', 'pescado blanco', 'pescado', 'filete de merluza', 'pescadilla', 'gallo', 'lenguado', 'rape', 'abadejo'], 180, { filete: 150, rodaja: 120 }],
  ['bacalao', 'Bacalao', 80, 18, 0, 0.7, ['bacalao', 'bacalao fresco', 'bacalao desalado'], 180, { filete: 150 }],
  ['salmon', 'Salmón', 205, 20, 0, 13.5, ['salmon', 'filete de salmon', 'lomo de salmon'], 150, { filete: 150, rodaja: 150 }],
  ['salmon-ahumado', 'Salmón ahumado', 180, 22, 0, 10, ['salmon ahumado'], 50, { loncha: 20 }],
  ['atun-fresco', 'Atún fresco', 145, 23, 0, 5, ['atun fresco', 'bonito', 'atun rojo'], 150, { filete: 150 }],
  ['atun-natural', 'Atún al natural (lata)', 110, 25, 0, 1, ['atun al natural', 'atun natural', 'lata de atun al natural'], 56, { lata: 56, unidad: 56 }],
  ['atun-aceite', 'Atún en aceite (escurrido)', 200, 26, 0, 10.5, ['atun', 'atun en aceite', 'lata de atun', 'bonito en aceite'], 56, { lata: 56, unidad: 56 }],
  ['sardinas', 'Sardinas en lata', 210, 24.5, 0, 12.5, ['sardinas', 'sardinillas', 'sardina', 'caballa en lata', 'caballa'], 80, { lata: 85 }],
  ['dorada', 'Dorada', 96, 20, 0, 1.7, ['dorada'], 180],
  ['lubina', 'Lubina', 97, 18.5, 0, 2, ['lubina', 'corvina', 'trucha'], 180],
  ['gambas', 'Gambas o langostinos', 85, 19, 0.5, 1, ['gambas', 'gamba', 'langostinos', 'langostino', 'marisco'], 120],
  ['mejillones', 'Mejillones', 86, 12, 3.7, 2.2, ['mejillones', 'mejillon', 'almejas', 'berberechos'], 150],
  ['calamar', 'Calamar o sepia', 90, 16, 2, 1.2, ['calamar', 'calamares', 'sepia', 'chipirones'], 150],
  ['pulpo', 'Pulpo', 82, 15, 2.2, 1, ['pulpo'], 150],
  ['boquerones', 'Boquerones', 130, 20, 0, 4.8, ['boquerones', 'boqueron', 'anchoas'], 100],
  ['surimi', 'Surimi', 95, 7.5, 14, 0.8, ['surimi', 'palitos de cangrejo', 'gulas'], 80, { unidad: 15 }],
  // Huevos y lácteos
  ['huevo', 'Huevo', 143, 12.6, 0.7, 9.5, ['huevo', 'huevos', 'huevo cocido', 'huevo duro', 'huevos revueltos', 'huevo pasado por agua', 'tortilla francesa', 'huevo a la plancha'], 55, { unidad: 55, huevo: 55 }],
  ['huevo-frito', 'Huevo frito', 196, 13.6, 0.8, 15, ['huevo frito', 'huevos fritos'], 60, { unidad: 60 }],
  ['clara', 'Clara de huevo', 52, 11, 0.7, 0.2, ['clara', 'claras', 'clara de huevo', 'claras de huevo'], 100, { unidad: 33 }],
  ['leche-semi', 'Leche semidesnatada', 46, 3.2, 4.7, 1.6, ['leche', 'leche semidesnatada', 'leche semi', 'vaso de leche'], 250, { vaso: 250, taza: 200, brick: 1000 }],
  ['leche-entera', 'Leche entera', 63, 3.1, 4.7, 3.6, ['leche entera'], 250, { vaso: 250, taza: 200 }],
  ['leche-desnatada', 'Leche desnatada', 35, 3.4, 4.9, 0.2, ['leche desnatada', 'leche sin lactosa desnatada'], 250, { vaso: 250, taza: 200 }],
  ['bebida-avena', 'Bebida de avena', 45, 0.8, 7.5, 1.3, ['bebida de avena', 'leche de avena'], 250, { vaso: 250, taza: 200 }],
  ['bebida-soja', 'Bebida de soja', 35, 3.3, 1.2, 1.8, ['bebida de soja', 'leche de soja'], 250, { vaso: 250, taza: 200 }],
  ['bebida-almendra', 'Bebida de almendra', 20, 0.5, 2, 1.1, ['bebida de almendra', 'leche de almendra', 'bebida de arroz', 'leche de arroz'], 250, { vaso: 250, taza: 200 }],
  ['yogur', 'Yogur natural', 60, 3.7, 4.5, 3, ['yogur', 'yogur natural', 'yogures', 'yogurt'], 125, { unidad: 125, yogur: 125 }],
  ['yogur-desnatado', 'Yogur desnatado', 40, 4.3, 5.5, 0.1, ['yogur desnatado', 'yogur 0%', 'yogur 0', 'yogures desnatados'], 125, { unidad: 125, yogur: 125 }],
  ['yogur-griego', 'Yogur griego', 125, 3.8, 4.5, 10, ['yogur griego', 'griego'], 125, { unidad: 125, yogur: 125 }],
  ['skyr', 'Skyr o yogur proteico', 63, 10, 4, 0.2, ['skyr', 'yogur proteico', 'yogur alto en proteinas', 'yogur de proteinas', 'yogur protein'], 150, { unidad: 150, yogur: 150 }],
  ['kefir', 'Kéfir', 60, 3.5, 4, 3.2, ['kefir'], 200, { vaso: 200 }],
  ['queso-fresco', 'Queso fresco', 180, 12, 3, 13, ['queso fresco', 'queso de burgos', 'queso burgos'], 60, { tarrina: 250, porcion: 60, loncha: 30 }],
  ['queso-batido', 'Queso fresco batido 0%', 46, 8, 3.5, 0.1, ['queso batido', 'queso fresco batido', 'quark'], 125, { tarrina: 500, cucharada: 20 }],
  ['requeson', 'Requesón', 100, 11, 3.5, 4, ['requeson', 'cottage'], 100],
  ['queso-curado', 'Queso curado', 400, 26, 0.5, 33, ['queso curado', 'queso manchego', 'manchego', 'parmesano', 'queso viejo'], 30, { loncha: 20, taco: 10 }],
  ['queso', 'Queso semicurado', 360, 24, 0.5, 29, ['queso', 'queso semicurado', 'queso tierno', 'queso en lonchas'], 30, { loncha: 20, taco: 10 }],
  ['mozzarella', 'Mozzarella', 250, 18, 1.5, 19, ['mozzarella', 'burrata'], 60, { bola: 125 }],
  ['queso-rallado', 'Queso rallado', 400, 28, 2, 31, ['queso rallado', 'queso para gratinar'], 20, { cucharada: 8 }],
  ['mantequilla', 'Mantequilla', 740, 0.7, 0.6, 82, ['mantequilla', 'margarina'], 10, { cucharada: 12, cucharadita: 5, nuez: 10 }],
  ['nata', 'Nata para cocinar', 195, 2.5, 3.5, 18, ['nata', 'nata para cocinar', 'crema de leche'], 50, { cucharada: 15, brick: 200 }],
  // Verdura y hortaliza
  ['tomate', 'Tomate', 19, 0.9, 3.5, 0.2, ['tomate', 'tomates', 'tomate natural', 'tomates cherry', 'cherry', 'tomate rallado'], 120, { unidad: 120 }],
  ['lechuga', 'Lechuga y hojas verdes', 15, 1.3, 1.5, 0.2, ['lechuga', 'ensalada verde', 'canonigos', 'rucula', 'hojas verdes', 'brotes', 'escarola', 'endibias'], 80, { plato: 100, bol: 80 }],
  ['ensalada', 'Ensalada (sin aliñar)', 20, 1.2, 3, 0.2, ['ensalada', 'ensalada mixta'], 150, { plato: 200, bol: 150 }],
  ['cebolla', 'Cebolla', 40, 1.1, 8, 0.1, ['cebolla', 'cebolleta', 'cebollas'], 60, { unidad: 120 }],
  ['zanahoria', 'Zanahoria', 41, 0.9, 7.6, 0.2, ['zanahoria', 'zanahorias'], 80, { unidad: 80 }],
  ['pimiento', 'Pimiento', 26, 1, 4.6, 0.3, ['pimiento', 'pimientos', 'pimiento rojo', 'pimiento verde', 'pimientos de padron'], 100, { unidad: 150 }],
  ['calabacin', 'Calabacín', 17, 1.2, 2.2, 0.3, ['calabacin', 'calabacines'], 200, { unidad: 250 }],
  ['berenjena', 'Berenjena', 25, 1, 2.6, 0.2, ['berenjena', 'berenjenas'], 200, { unidad: 250 }],
  ['brocoli', 'Brócoli', 34, 2.8, 4, 0.4, ['brocoli', 'brecol'], 200],
  ['coliflor', 'Coliflor', 25, 1.9, 3, 0.3, ['coliflor', 'repollo', 'col', 'lombarda', 'coles de bruselas'], 200],
  ['espinacas', 'Espinacas', 23, 2.9, 1.4, 0.4, ['espinacas', 'espinaca', 'acelgas', 'kale'], 200],
  ['judias-verdes', 'Judías verdes', 31, 1.8, 4.3, 0.2, ['judias verdes', 'judia verde', 'vainas'], 200],
  ['champinones', 'Champiñones y setas', 22, 3.1, 0.5, 0.3, ['champinones', 'champinon', 'setas', 'seta', 'boletus'], 150],
  ['pepino', 'Pepino', 15, 0.7, 2.6, 0.1, ['pepino', 'pepinos'], 100, { unidad: 200 }],
  ['calabaza', 'Calabaza', 26, 1, 5.5, 0.1, ['calabaza', 'crema de calabaza'], 200],
  ['esparragos', 'Espárragos', 20, 2.2, 2, 0.1, ['esparragos', 'esparrago', 'esparragos trigueros'], 150],
  ['alcachofa', 'Alcachofa', 47, 3.3, 5, 0.2, ['alcachofa', 'alcachofas'], 150, { unidad: 120 }],
  ['puerro', 'Puerro', 61, 1.5, 12, 0.3, ['puerro', 'puerros'], 100, { unidad: 150 }],
  ['maiz', 'Maíz dulce', 85, 3, 15, 1.2, ['maiz', 'maiz dulce'], 80, { lata: 140 }],
  ['verduras', 'Verduras variadas', 35, 2, 5, 0.3, ['verduras', 'verdura', 'menestra', 'verduras al horno', 'verduras salteadas', 'parrillada de verduras', 'pisto', 'wok de verduras'], 200, { plato: 250 }],
  ['gazpacho', 'Gazpacho', 45, 0.8, 4, 2.8, ['gazpacho', 'salmorejo'], 250, { vaso: 250 }],
  ['aceitunas', 'Aceitunas', 145, 1, 1, 15, ['aceitunas', 'aceituna', 'olivas'], 30, { unidad: 4, puñado: 30 }],
  ['aguacate', 'Aguacate', 160, 2, 1.9, 15, ['aguacate', 'aguacates', 'guacamole'], 70, { unidad: 140, medio: 70 }],
  // Fruta
  ['manzana', 'Manzana', 52, 0.3, 12, 0.2, ['manzana', 'manzanas'], 150, { unidad: 150 }],
  ['platano', 'Plátano', 89, 1.1, 20, 0.3, ['platano', 'platanos', 'banana', 'bananas'], 120, { unidad: 120 }],
  ['naranja', 'Naranja', 47, 0.9, 9.5, 0.1, ['naranja', 'naranjas', 'pomelo'], 160, { unidad: 160 }],
  ['mandarina', 'Mandarina', 53, 0.8, 11.5, 0.3, ['mandarina', 'mandarinas', 'clementina'], 140, { unidad: 70 }],
  ['pera', 'Pera', 57, 0.4, 12, 0.1, ['pera', 'peras'], 170, { unidad: 170 }],
  ['kiwi', 'Kiwi', 61, 1.1, 11, 0.5, ['kiwi', 'kiwis'], 75, { unidad: 75 }],
  ['fresas', 'Fresas', 32, 0.7, 6, 0.3, ['fresas', 'fresa', 'fresones'], 150, { unidad: 15, bol: 150 }],
  ['arandanos', 'Arándanos', 57, 0.7, 12, 0.3, ['arandanos', 'frutos rojos', 'frutos del bosque'], 80, { puñado: 50 }],
  ['frambuesas', 'Frambuesas', 52, 1.2, 5.5, 0.7, ['frambuesas', 'moras'], 80, { puñado: 50 }],
  ['uvas', 'Uvas', 69, 0.7, 16, 0.2, ['uvas', 'uva'], 150, { racimo: 150 }],
  ['melon', 'Melón', 34, 0.8, 8, 0.2, ['melon'], 200, { tajada: 200, rodaja: 200 }],
  ['sandia', 'Sandía', 30, 0.6, 7.5, 0.2, ['sandia'], 250, { tajada: 250, rodaja: 250 }],
  ['pina', 'Piña', 50, 0.5, 12, 0.1, ['piña', 'pina'], 150, { rodaja: 80 }],
  ['mango', 'Mango', 60, 0.8, 13.5, 0.4, ['mango'], 150, { unidad: 200 }],
  ['melocoton', 'Melocotón', 39, 0.9, 8.5, 0.3, ['melocoton', 'melocotones', 'nectarina', 'paraguayo', 'albaricoque'], 150, { unidad: 150 }],
  ['ciruela', 'Ciruela', 46, 0.7, 10, 0.3, ['ciruela', 'ciruelas'], 120, { unidad: 60 }],
  ['cerezas', 'Cerezas', 63, 1.1, 14, 0.2, ['cerezas', 'cereza'], 120, { puñado: 80 }],
  ['higos', 'Higos', 74, 0.8, 16, 0.3, ['higos', 'higo'], 100, { unidad: 50 }],
  ['datiles', 'Dátiles', 280, 2.5, 66, 0.4, ['datiles', 'datil'], 30, { unidad: 8 }],
  ['pasas', 'Pasas', 300, 3, 72, 0.5, ['pasas', 'uvas pasas', 'orejones'], 30, { puñado: 30 }],
  ['zumo-naranja', 'Zumo de naranja', 45, 0.7, 10, 0.2, ['zumo de naranja', 'zumo', 'zumo natural', 'zumo de fruta'], 200, { vaso: 200 }],
  ['fruta', 'Fruta (pieza)', 50, 0.6, 11, 0.2, ['fruta', 'pieza de fruta', 'fruta de temporada', 'macedonia'], 150, { unidad: 150, pieza: 150 }],
  // Frutos secos y semillas
  ['nueces', 'Nueces', 655, 15, 7, 65, ['nueces', 'nuez'], 25, { unidad: 5, puñado: 30 }],
  ['almendras', 'Almendras', 600, 21, 8, 52, ['almendras', 'almendra'], 25, { unidad: 1.2, puñado: 30 }],
  ['cacahuetes', 'Cacahuetes', 590, 26, 12, 49, ['cacahuetes', 'cacahuete', 'mani'], 25, { puñado: 30 }],
  ['anacardos', 'Anacardos', 580, 18, 27, 46, ['anacardos', 'anacardo'], 25, { puñado: 30 }],
  ['pistachos', 'Pistachos', 570, 20, 18, 46, ['pistachos', 'pistacho'], 25, { puñado: 30 }],
  ['avellanas', 'Avellanas', 650, 15, 7, 61, ['avellanas', 'avellana'], 25, { puñado: 30 }],
  ['frutos-secos', 'Frutos secos variados', 610, 19, 12, 53, ['frutos secos', 'frutos secos variados', 'mix de frutos secos'], 25, { puñado: 30 }],
  ['crema-cacahuete', 'Crema de cacahuete', 600, 25, 13, 50, ['crema de cacahuete', 'mantequilla de cacahuete', 'crema de almendras'], 16, { cucharada: 16, cucharadita: 6 }],
  ['chia', 'Semillas de chía', 490, 17, 8, 31, ['chia', 'semillas de chia', 'semillas', 'lino', 'semillas de lino', 'sesamo'], 12, { cucharada: 12 }],
  ['pipas', 'Pipas de girasol', 585, 21, 11, 51, ['pipas', 'pipas de girasol', 'pipas de calabaza'], 25, { puñado: 30 }],
  // Grasas, salsas y dulces
  ['aceite-oliva', 'Aceite de oliva', 900, 0, 0, 100, ['aceite', 'aceite de oliva', 'aove', 'aceite de oliva virgen extra', 'aceite de oliva virgen', 'chorrito de aceite'], 10, { cucharada: 10, cucharadita: 4, chorrito: 5 }],
  ['aceite-girasol', 'Aceite de girasol', 900, 0, 0, 100, ['aceite de girasol', 'aceite de coco'], 10, { cucharada: 10, cucharadita: 4 }],
  ['mayonesa', 'Mayonesa', 700, 1, 1.5, 77, ['mayonesa', 'alioli', 'salsa rosa'], 15, { cucharada: 15 }],
  ['ketchup', 'Ketchup', 110, 1.2, 25, 0.2, ['ketchup', 'salsa barbacoa'], 15, { cucharada: 15 }],
  ['tomate-frito', 'Tomate frito', 75, 1.5, 9, 3.5, ['tomate frito', 'salsa de tomate', 'tomate triturado'], 50, { cucharada: 15 }],
  ['soja', 'Salsa de soja', 55, 8, 5, 0.1, ['salsa de soja', 'soja'], 10, { cucharada: 15 }],
  ['miel', 'Miel', 305, 0.3, 82, 0, ['miel', 'sirope', 'sirope de agave'], 15, { cucharada: 20, cucharadita: 7 }],
  ['azucar', 'Azúcar', 400, 0, 100, 0, ['azucar', 'azucar moreno', 'sobre de azucar', 'panela'], 8, { cucharada: 12, cucharadita: 5, sobre: 8 }],
  ['mermelada', 'Mermelada', 250, 0.4, 60, 0.1, ['mermelada', 'confitura', 'membrillo'], 20, { cucharada: 20, cucharadita: 8 }],
  ['chocolate-negro', 'Chocolate negro', 570, 8, 34, 42, ['chocolate negro', 'chocolate', 'chocolate 70', 'chocolate 85'], 20, { onza: 10, tableta: 100 }],
  ['chocolate-leche', 'Chocolate con leche', 535, 7.5, 57, 30, ['chocolate con leche', 'chocolatina'], 20, { onza: 10, tableta: 100 }],
  ['cacao-puro', 'Cacao puro en polvo', 350, 20, 12, 21, ['cacao puro', 'cacao en polvo', 'cacao desgrasado'], 10, { cucharada: 10, cucharadita: 4 }],
  ['cacao-soluble', 'Cacao soluble', 375, 6, 77, 3, ['cola cao', 'colacao', 'nesquik', 'cacao soluble'], 15, { cucharada: 10, cucharadita: 5 }],
  ['croissant', 'Croissant', 410, 8, 45, 21, ['croissant', 'cruasan', 'napolitana', 'bolleria', 'bollo', 'donut'], 50, { unidad: 50 }],
  ['magdalena', 'Magdalena', 400, 6, 50, 19, ['magdalena', 'magdalenas', 'muffin'], 30, { unidad: 30 }],
  ['bizcocho', 'Bizcocho', 370, 6.5, 55, 13, ['bizcocho', 'tarta', 'pastel'], 60, { porcion: 70, trozo: 60 }],
  ['helado', 'Helado', 210, 3.5, 24, 11, ['helado', 'helados'], 80, { bola: 50, unidad: 80 }],
  // Platos
  ['tortilla-patatas', 'Tortilla de patatas', 155, 6, 11, 10, ['tortilla de patatas', 'tortilla española', 'tortilla'], 120, { pincho: 120, porcion: 120 }],
  ['croquetas', 'Croquetas', 240, 7, 20, 14, ['croquetas', 'croqueta'], 90, { unidad: 30 }],
  ['pizza', 'Pizza', 260, 11, 32, 10, ['pizza'], 220, { porcion: 110, trozo: 110, unidad: 400 }],
  ['paella', 'Paella', 150, 7, 20, 4.5, ['paella', 'arroz con pollo', 'arroz al horno', 'arroz a banda'], 300, { plato: 300 }],
  ['sopa', 'Sopa', 40, 1.5, 6, 1, ['sopa', 'sopa de fideos', 'crema de verduras', 'pure de verduras', 'pure'], 250, { plato: 250, bol: 250 }],
  ['caldo', 'Caldo', 10, 1, 0.5, 0.4, ['caldo', 'consome'], 250, { taza: 250 }],
  // Bebidas
  ['cafe', 'Café solo', 2, 0.1, 0, 0, ['cafe', 'cafe solo', 'espresso', 'cafe americano', 'cortado'], 50, { taza: 50 }],
  ['cafe-con-leche', 'Café con leche', 24, 1.6, 2.4, 0.8, ['cafe con leche', 'cafe con leche semidesnatada', 'capuchino', 'cafe latte', 'manchado'], 200, { taza: 200, vaso: 200 }],
  ['te', 'Té o infusión', 1, 0, 0.2, 0, ['te', 'infusion', 'manzanilla', 'poleo', 'te verde', 'rooibos'], 250, { taza: 250 }],
  ['refresco', 'Refresco azucarado', 42, 0, 10.6, 0, ['refresco', 'coca cola', 'cocacola', 'fanta', 'cola', 'tonica'], 330, { lata: 330, vaso: 250 }],
  ['refresco-zero', 'Refresco sin azúcar', 0.5, 0, 0, 0, ['refresco zero', 'coca cola zero', 'cola zero', 'refresco light', 'zero'], 330, { lata: 330 }],
  ['cerveza', 'Cerveza', 43, 0.5, 3.6, 0, ['cerveza', 'caña', 'tercio', 'botellin'], 330, { caña: 200, tercio: 330, lata: 330, botellin: 250 }],
  ['cerveza-sin', 'Cerveza sin alcohol', 22, 0.4, 4.5, 0, ['cerveza sin alcohol', 'cerveza sin', 'cerveza 0,0', 'cerveza 0.0'], 330, { caña: 200, tercio: 330, lata: 330 }],
  ['vino', 'Vino', 85, 0.1, 2.6, 0, ['vino', 'vino tinto', 'vino blanco', 'cava', 'vino rosado'], 150, { copa: 150, vaso: 150 }],
  ['proteina', 'Proteína en polvo (whey)', 380, 78, 6, 5.5, ['proteina', 'proteina en polvo', 'whey', 'batido de proteinas', 'batido de proteina', 'proteina whey'], 30, { scoop: 30, cacito: 30, medida: 30, cazo: 30 }],
  ['isotonica', 'Bebida isotónica', 25, 0, 6, 0, ['isotonica', 'aquarius', 'powerade', 'bebida isotonica'], 330, { lata: 330, botella: 500 }],
  ['agua', 'Agua', 0, 0, 0, 0, ['agua', 'agua con gas'], 250, { vaso: 250, botella: 500 }],
];

export interface FoodRef extends Macros {
  key: string;
  name: string;
  portion: number;
  units: Record<string, number>;
  synonyms: string[];
  custom?: boolean;
  brand?: string;
}

export const FOODS: FoodRef[] = ROWS.map(([key, name, kcal, protein, carbs, fat, synonyms, portion, units]) => ({
  key,
  name,
  kcal,
  protein,
  carbs,
  fat,
  synonyms,
  portion,
  units: units ?? {},
}));

export function customToRef(f: CustomFood): FoodRef {
  return {
    key: f.id,
    name: f.name,
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    synonyms: [f.name, f.brand ? `${f.name} ${f.brand}` : ''].filter(Boolean),
    portion: f.unitGrams ?? 100,
    units: f.unitGrams ? { unidad: f.unitGrams, ...(f.unitName ? { [fold(f.unitName)]: f.unitGrams } : {}) } : {},
    custom: true,
    brand: f.brand,
  };
}

export function allFoods(custom: CustomFood[]): FoodRef[] {
  return [...custom.map(customToRef), ...FOODS];
}

export function findFood(key: string | undefined, custom: CustomFood[]): FoodRef | undefined {
  if (!key) return undefined;
  return custom.some((c) => c.id === key) ? customToRef(custom.find((c) => c.id === key)!) : FOODS.find((f) => f.key === key);
}

export const r1 = (x: number) => Math.round(x * 10) / 10;

/** Macros para una cantidad en gramos. */
export function macrosFor(food: Macros, grams: number): Macros {
  const k = grams / 100;
  return { kcal: Math.round(food.kcal * k), protein: r1(food.protein * k), carbs: r1(food.carbs * k), fat: r1(food.fat * k) };
}

export function sumMacros(list: Macros[]): Macros {
  const t = list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat) };
}

/** Búsqueda por nombre (para el buscador). */
export function searchFoods(query: string, custom: CustomFood[], limit = 12): FoodRef[] {
  const q = fold(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored: { f: FoodRef; s: number }[] = [];
  for (const f of allFoods(custom)) {
    const names = [f.name, ...f.synonyms].map(fold);
    let best = 0;
    for (const n of names) {
      const nWords = n.split(/[\s(),]+/);
      if (n === q) best = Math.max(best, 100);
      else if (n.startsWith(q)) best = Math.max(best, 80 - n.length / 10);
      // Cada palabra buscada es el principio de alguna palabra del nombre
      else if (words.every((w) => nWords.some((nw) => nw.startsWith(w)))) best = Math.max(best, 50 - n.length / 10);
    }
    if (best > 0) scored.push({ f, s: best + (f.custom ? 5 : 0) });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.f);
}

/** Macros multiplicados por un factor (al cambiar la cantidad de algo ya apuntado). */
export function scaleMacros(m: Macros, k: number): Macros {
  return { kcal: Math.round(m.kcal * k), protein: r1(m.protein * k), carbs: r1(m.carbs * k), fat: r1(m.fat * k) };
}

const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
/** «P 23 · H 0 · G 1,5» (proteína, hidratos y grasa en gramos). */
export function macroLine(m: Macros): string {
  return `P ${nf1.format(m.protein)} · H ${nf1.format(m.carbs)} · G ${nf1.format(m.fat)}`;
}

/** Botones de cantidad rápida: la ración y las unidades del alimento. */
export function quickAmounts(food: FoodRef, limit = 4): { label: string; grams: number }[] {
  const out: { label: string; grams: number }[] = [{ label: `1 ración · ${nf1.format(food.portion)} g`, grams: food.portion }];
  for (const [unit, grams] of Object.entries(food.units)) {
    if (out.some((o) => o.grams === grams)) continue;
    out.push({ label: `1 ${unit} · ${nf1.format(grams)} g`, grams });
  }
  if (!out.some((o) => o.grams === 100)) out.push({ label: '100 g', grams: 100 });
  return out.slice(0, limit);
}
