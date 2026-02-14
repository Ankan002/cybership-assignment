import type { RateRequest, RateQuote } from "@/models/rate";
import type { UPSRateResponse } from "./ups.types";
import type { Address } from "@/models/address";
import type { Package } from "@/models/package";

function mapShipmentLocation(address: Address) {
	return {
		Name: address.name ?? "N/A",
		Address: {
			AddressLine: [address.addressLine1, address.addressLine2].filter(
				Boolean,
			) as string[],

			City: address.city,
			StateProvinceCode: address.state,
			PostalCode: address.postalCode,
			CountryCode: address.countryCode,
		},
	};
}

function mapPackages(packages: Package[]) {
	return packages.map((pkg) => ({
		PackagingType: { Code: "02" },

		Dimensions: pkg.dimensions
			? {
					UnitOfMeasurement: {
						Code: pkg.dimensions.unit,
					},
					Length: pkg.dimensions.length.toString(),
					Width: pkg.dimensions.width.toString(),
					Height: pkg.dimensions.height.toString(),
				}
			: undefined,

		PackageWeight: {
			UnitOfMeasurement: {
				Code: pkg.weight.unit,
			},
			Weight: pkg.weight.value.toString(),
		},
	}));
}

export function mapToUPSRateRequest(request: RateRequest) {
	return {
		RateRequest: {
			Request: {
				TransactionReference: {
					CustomerContext: "rate-request",
				},
			},

			Shipment: {
				Shipper: mapShipmentLocation(request.origin),
				ShipFrom: mapShipmentLocation(request.origin),
				ShipTo: mapShipmentLocation(request.destination),

				Service: request.serviceLevel
					? { Code: request.serviceLevel }
					: undefined,

				Package: mapPackages(request.packages),
			},
		},
	};
}

export function mapFromUPSRateResponse(response: UPSRateResponse): RateQuote[] {
	return response.RateResponse.RatedShipment.map((shipment) => ({
		carrier: "ups",

		serviceCode: shipment.Service.Code,
		serviceName: shipment.Service.Description ?? shipment.Service.Code,

		totalCharge: {
			currency: shipment.TotalCharges.CurrencyCode,
			amount: Number(shipment.TotalCharges.MonetaryValue),
		},

		estimatedDays: shipment.TimeInTransit?.ServiceSummary?.EstimatedArrival
			?.BusinessDaysInTransit
			? Number(
					shipment.TimeInTransit.ServiceSummary.EstimatedArrival
						.BusinessDaysInTransit,
				)
			: undefined,
	}));
}
