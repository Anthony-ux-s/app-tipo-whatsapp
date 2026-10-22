package mercaya

// Producto tal como lo publica MercaYa (español, precios en céntimos).
type Producto struct {
	SKU            string  `json:"sku"`
	Nombre         string  `json:"nombre"`
	Presentacion   string  `json:"presentacion"`
	PrecioCentimos int     `json:"precio_centimos"`
	Stock          int     `json:"stock"`
	Categoria      string  `json:"categoria"`
	Imagen         *string `json:"imagen"`
	// PrecioAntesCentimos: precio normal cuando el producto está en oferta (PrecioCentimos es el rebajado).
	PrecioAntesCentimos *int `json:"precio_antes_centimos,omitempty"`
}

// catalogoInicial: abarrotes y productos del día de una bodega peruana.
func catalogoInicial() []Producto {
	p := func(sku, nombre, presentacion string, precio, stock int, categoria string) Producto {
		return Producto{SKU: sku, Nombre: nombre, Presentacion: presentacion, PrecioCentimos: precio, Stock: stock, Categoria: categoria}
	}
	productos := []Producto{
		p("AZU-RUB-1K", "Azúcar rubia", "1 kg", 450, 200, "Abarrotes"),
		p("AZU-BLA-1K", "Azúcar blanca", "1 kg", 520, 150, "Abarrotes"),
		p("ARR-EXT-1K", "Arroz extra", "1 kg", 480, 300, "Abarrotes"),
		p("ARR-EXT-5K", "Arroz extra", "5 kg", 2290, 80, "Abarrotes"),
		p("ARR-SUP-1K", "Arroz superior", "1 kg", 420, 120, "Abarrotes"),
		p("ACE-VEG-1L", "Aceite vegetal", "1 L", 1090, 90, "Abarrotes"),
		p("SAL-YOD-1K", "Sal de mesa yodada", "1 kg", 190, 140, "Abarrotes"),
		p("FID-SPA-500", "Fideos spaghetti", "500 g", 350, 160, "Abarrotes"),
		p("FID-COD-250", "Fideos codito", "250 g", 220, 110, "Abarrotes"),
		p("HAR-TRI-1K", "Harina de trigo", "1 kg", 560, 60, "Abarrotes"),
		p("AVE-HOJ-900", "Avena en hojuelas", "900 g", 790, 70, "Desayuno"),
		p("CAF-SOL-200", "Café instantáneo", "200 g", 1590, 45, "Desayuno"),
		p("LEC-EVA-400", "Leche evaporada", "400 g", 420, 240, "Lácteos"),
		p("LEC-EVA-6PK", "Leche evaporada (6 latas)", "6 × 400 g", 2390, 50, "Lácteos"),
		p("YOG-FRE-1L", "Yogur de fresa", "1 L", 690, 40, "Lácteos"),
		p("QUE-FRE-500", "Queso fresco", "500 g", 1290, 30, "Lácteos"),
		p("HUE-PAR-15", "Huevos pardos", "15 unidades", 1150, 75, "Huevos"),
		p("PAN-FRA-10", "Pan francés", "10 unidades", 400, 100, "Panadería"),
		p("ATU-FIL-170", "Atún en filete", "170 g", 650, 130, "Conservas"),
		p("SAR-TOM-425", "Sardinas en salsa de tomate", "425 g", 590, 60, "Conservas"),
		p("LEN-BEB-500", "Lentejas bebé", "500 g", 530, 85, "Menestras"),
		p("FRE-CAN-500", "Frejol canario", "500 g", 790, 55, "Menestras"),
		p("GAR-500", "Garbanzos", "500 g", 610, 40, "Menestras"),
		p("PLA-ISL-1K", "Plátano de isla", "1 kg", 390, 90, "Frutas y verduras"),
		p("MAN-ISR-1K", "Manzana israel", "1 kg", 690, 70, "Frutas y verduras"),
		p("PAP-AMA-1K", "Papa amarilla", "1 kg", 450, 120, "Frutas y verduras"),
		p("CEB-ROJ-1K", "Cebolla roja", "1 kg", 320, 110, "Frutas y verduras"),
		p("LIM-1K", "Limón", "1 kg", 550, 60, "Frutas y verduras"),
		p("DET-POL-900", "Detergente en polvo", "900 g", 1250, 50, "Limpieza"),
		p("LEJ-1L", "Lejía", "1 L", 390, 80, "Limpieza"),
		p("PAP-HIG-4", "Papel higiénico doble hoja", "4 rollos", 590, 90, "Limpieza"),
		p("AGU-MIN-2L", "Agua mineral sin gas", "2.5 L", 350, 150, "Bebidas"),
		p("GAS-COL-1L", "Gaseosa sabor original", "1.5 L", 650, 100, "Bebidas"),
	}
	// Ofertas de la semana: precio normal antes de la rebaja.
	ofertas := map[string]int{
		"ACE-VEG-1L":  1290,
		"ARR-EXT-5K":  2690,
		"LEC-EVA-6PK": 2690,
		"CAF-SOL-200": 1890,
		"HUE-PAR-15":  1290,
		"DET-POL-900": 1490,
		"ATU-FIL-170": 750,
		"MAN-ISR-1K":  850,
	}
	for i := range productos {
		if antes, ok := ofertas[productos[i].SKU]; ok {
			productos[i].PrecioAntesCentimos = &antes
		}
	}
	return productos
}

// catalogoTecnologia: la tienda de tecnología de prueba (TecnoYa).
func catalogoTecnologia() []Producto {
	p := func(sku, nombre, presentacion string, precio, stock int, categoria string) Producto {
		return Producto{SKU: sku, Nombre: nombre, Presentacion: presentacion, PrecioCentimos: precio, Stock: stock, Categoria: categoria}
	}
	productos := []Producto{
		p("CEL-A15-128", "Celular Galaxy A15 128 GB", "1 unidad", 64900, 25, "Celulares"),
		p("CEL-RN13-256", "Celular Redmi Note 13 256 GB", "1 unidad", 89900, 18, "Celulares"),
		p("CEL-MOTO-G24", "Celular Moto G24 128 GB", "1 unidad", 54900, 30, "Celulares"),
		p("LAP-IDEA-I5", "Laptop IdeaPad 15\" Core i5 16 GB", "1 unidad", 249900, 8, "Laptops"),
		p("LAP-VIVO-R7", "Laptop VivoBook 14\" Ryzen 7 16 GB", "1 unidad", 279900, 6, "Laptops"),
		p("TAB-TAB-A9", "Tablet Galaxy Tab A9 64 GB", "1 unidad", 69900, 12, "Tablets"),
		p("AUD-BT-PRO", "Audífonos Bluetooth con cancelación de ruido", "1 par", 19900, 40, "Audio"),
		p("AUD-EAR-BUDS", "Audífonos inalámbricos earbuds", "1 par", 8990, 60, "Audio"),
		p("PAR-BT-MINI", "Parlante Bluetooth portátil", "1 unidad", 12900, 35, "Audio"),
		p("REL-SMART-5", "Reloj inteligente deportivo", "1 unidad", 15900, 22, "Accesorios"),
		p("CAR-USB-C-65", "Cargador rápido USB-C 65 W", "1 unidad", 7990, 80, "Accesorios"),
		p("CAB-USB-C-2M", "Cable USB-C a USB-C 2 m", "1 unidad", 2490, 150, "Accesorios"),
		p("POW-20K", "Batería externa 20 000 mAh", "1 unidad", 9990, 45, "Accesorios"),
		p("MOU-INAL", "Mouse inalámbrico", "1 unidad", 3990, 70, "Computación"),
		p("TEC-MEC-RGB", "Teclado mecánico RGB", "1 unidad", 14900, 20, "Computación"),
		p("MON-24-FHD", "Monitor 24\" Full HD", "1 unidad", 49900, 10, "Computación"),
	}
	ofertas := map[string]int{
		"CEL-A15-128": 72900,
		"AUD-BT-PRO":  24900,
		"POW-20K":     12990,
		"LAP-IDEA-I5": 279900,
	}
	for i := range productos {
		if antes, ok := ofertas[productos[i].SKU]; ok {
			productos[i].PrecioAntesCentimos = &antes
		}
	}
	return productos
}
