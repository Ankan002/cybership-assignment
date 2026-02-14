export interface PackageDimensions {
	length: number;
	width: number;
	height: number;
	unit: "CM" | "IN";
}

export interface PackageWeight {
	value: number;
	unit: "KG" | "LB";
}

export interface Package {
	dimensions: PackageDimensions;
	weight: PackageWeight;
}
