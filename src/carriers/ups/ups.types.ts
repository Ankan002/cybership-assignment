// Response Types
export interface UPSRateResponse {
	RateResponse: {
		RatedShipment: UPSRatedShipment[];
	};
}

export interface UPSRatedShipment {
	Service: {
		Code: string;
		Description?: string;
	};

	TotalCharges: {
		CurrencyCode: string;
		MonetaryValue: string;
	};

	TimeInTransit?: {
		ServiceSummary?: {
			EstimatedArrival?: {
				BusinessDaysInTransit?: string;
			};
		};
	};
}

// Request Types
export interface UPSRateRequest {
	RateRequest: {
		Request?: {
			TransactionReference?: {
				CustomerContext?: string;
			};
		};

		Shipment: {
			Shipper: UPSShipmentLocation;
			ShipFrom: UPSShipmentLocation;
			ShipTo: UPSShipmentLocation;

			Service?: {
				Code: string;
			};

			Package: UPSPackage[];
		};
	};
}

export interface UPSShipmentLocation {
	Name?: string;

	Address: {
		AddressLine: string[];
		City: string;
		StateProvinceCode?: string;
		PostalCode: string;
		CountryCode: string;
	};
}

export interface UPSPackage {
	PackagingType: {
		Code: string;
	};

	Dimensions?: {
		UnitOfMeasurement: {
			Code: string;
		};
		Length: string;
		Width: string;
		Height: string;
	};

	PackageWeight: {
		UnitOfMeasurement: {
			Code: string;
		};
		Weight: string;
	};
}
