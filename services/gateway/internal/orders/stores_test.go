package orders

import (
	"context"
	"net/http"
	"testing"

	"github.com/parla/gateway/internal/services"
)

// fakeStores: Tecnología conectada (con su tienda) o apagada.
type fakeStores struct {
	tecno *fakeCommerce
	on    bool
}

func (f fakeStores) For(_ context.Context, service services.ServiceID) (Commerce, error) {
	if service != services.Tecnologia || !f.on {
		return nil, ErrServiceOff
	}
	return f.tecno, nil
}

func (f fakeStores) Enabled(_ context.Context, service services.ServiceID) bool {
	return service == services.Tecnologia && f.on
}

func TestTecnologiaSoloConLaTiendaQueConectoSoporte(t *testing.T) {
	ctx := context.Background()
	mercado := &fakeCommerce{products: map[string]services.Product{"AZU-RUB-1K": {ID: "AZU-RUB-1K", Name: "Azúcar rubia"}}}
	tecno := &fakeCommerce{products: map[string]services.Product{"CEL-A15-128": {ID: "CEL-A15-128", Name: "Celular Galaxy A15"}}}

	// Apagada: no aparece disponible y su catálogo responde 404.
	off := &Orchestrator{Commerce: mercado, Stores: fakeStores{tecno: tecno, on: false}}
	if tec := find(off.CatalogFor(ctx), services.Tecnologia); tec.Available {
		t.Fatal("Tecnología no debería estar disponible sin tienda conectada")
	}
	if _, err := off.Products(ctx, services.Tecnologia, ""); status(err) != http.StatusNotFound {
		t.Fatalf("sin tienda esperaba 404, obtuve %v", err)
	}

	// Conectada: disponible, y busca en su tienda (no en la del Mercado).
	on := &Orchestrator{Commerce: mercado, Stores: fakeStores{tecno: tecno, on: true}}
	if tec := find(on.CatalogFor(ctx), services.Tecnologia); !tec.Available {
		t.Fatal("con la tienda conectada, Tecnología debería estar disponible")
	}
	got, err := on.Products(ctx, services.Tecnologia, "")
	if err != nil || len(got) != 1 || got[0].ID != "CEL-A15-128" {
		t.Fatalf("esperaba el catálogo de la tienda de tecnología, obtuve %+v %v", got, err)
	}
	if got, _ := on.Products(ctx, services.Mercado, ""); len(got) != 1 || got[0].ID != "AZU-RUB-1K" {
		t.Fatalf("el Mercado sigue con su tienda, obtuve %+v", got)
	}
}

func find(list []services.ServiceInfo, id services.ServiceID) services.ServiceInfo {
	for _, s := range list {
		if s.ID == id {
			return s
		}
	}
	return services.ServiceInfo{}
}
