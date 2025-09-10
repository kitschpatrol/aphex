import { lookup, mimes } from 'mrmime'

// Icky global state
mimes.arw = 'image/arw'
mimes.cr2 = 'image/cr2'
mimes.cr3 = 'image/cr3'
mimes.crw = 'image/crw'
mimes.dng = 'image/dng'
mimes.nef = 'image/nef'
mimes.pef = 'image/pef'
mimes.psb = 'image/psb'
mimes.psd = 'image/psd'
mimes.psd = 'image/psd'
mimes.raw = 'image/raw'
mimes.tga = 'image/tga'

// All Exiftool read + write supported formats, May 2024:
// 360 3G2 3GP AAX AI ARQ ARW AVIF CR2 CR3 CRM CRW CS1 DCP DNG DR4 DVB EPS ERF
// EXIF EXV FFF FLIF GIF GLV GPR HDP HEIC HEIF ICC IIQ IND INSP JNG JP2 JPEG LRV
// MEF MIE MNG MOS MOV MP4 MPO MQV MRW NEF NKSC NRW ORF ORI PBM PDF PEF PGM PNG
// PPM PS PSB PSD QTIF RAF RAW RW2 RWL SR2 SRW THM TIFF V VRD WDP WEBP X3F XMP

// All Exiftool read supported formats, May 2024:
// 3FR 7Z A AA AAC AAE ACR AFM AIFF APE ASF AVI AZW BMP BPG BTF C2PA CHM COS CSV CUR CZI DCM DCR DFONT DIVX DJVU DLL DOCX DPX DSS DV DVR-MS DYLIB EIP EPUB EXE EXR FITS FLA FLAC FLV FPF FPX GZ HDR HTML ICO ICS IDML INSV INX ITC J2C JSON JXL K25 KDC KEY LA LFP LIF LNK M2TS MACOS MAX MIFF MKA MKS MKV MOBI MODD MOI MP3 MPC MPG MRC MXF O ODP ODS ODT OFR OGG OGV ONP OPUS OTF PAC PAGES PCD PCX PDB PFA PFB PFM PGF PICT PLIST PMP PPT PPTX PSP R3D RA RAM RAR

// Exiftool does not have write-only formats.

// All imagemagick read + write supported formats, May 2024:
// AAI APNG ART AVIF AVS BAYER BPG BMP BMP2 BMP3 CIN CMYK CMYKA DCX DDS DIB DMR DPX EPDF EPI EPS EPSF EPSI EPT EXR FARBFELD FAX FITS FL32 FLIF FPX FTXT GIF GRAY GRAYA HDR HDR HEIC HRZ HTML JBIG JNG JP2 JPT J2C J2K JPEG JXR JXL MIFF MONO MNG M2V MPEG MPC MPR MSL MTV MVG OTB P7 PALM CLIPBOARD PBM PCD PCDS PCX PDB PDF PFM PGM PHM PICON PICT PNG PNG8 PNG00 PNG24 PNG32 PNG48 PNG64 PNM POCKETMOD PPM PS PS2 PS3 PSB PSD PTIF QOI RAW RGB RGBA RGF SGI STRIMG SUN SVG TGA TIFF TXT UHDR UYVY VICAR VIDEO VIFF WBMP WDP WEBP X XBM XPM XWD YCbCr YCbCrA YUV CLIP CLIPBOARD INLINE MAP MASK NULL VID WIN X

// All imagemagick read supported formats, May 2024:
// ARW AVI CALS CANVAS CAPTION CR2 CRW CUBE CUR CUT DCM DCR DJVU DNG DOT EMF FRACTAL GPLT GRADIENT HALD HPGL ICO LABEL MAN MAT MPO MRW NEF ORA ORF PANGO PEF PES PFA PFB PIX PLASMA PWP RAD RADIAL_GRADIENT RAF RGB565 RLA RLE SCAN SCANX SCREENSHOT SCT SFW SID, MrSID STEGANO TEXT TILE TIM TTF WMF WPG X3F XC XCF

// All imagemagick write supported formats, May 2024:
// ASHLAR BRF CIP DEBUG EPS2 EPS3 HISTOGRAM INFO ISOBRL ISOBRL6 JSON KERNEL MATTE PAM PCL PREVIEW PRINT SHTML SPARSE-COLOR UBRL UBRL6 UIL UNIQUE YAML

// The '' prefix is implicit
const IMAGE_MIME_TYPES = [
	'arw', // Sony raw
	'avif', // Noted for high efficiency in compression (Emerging)
	'bmp', // Older format still used in some applications (Occasional)
	'cr2', // Canon raw 2004+
	'cr3', // Canon raw 2018+
	'crw', // Original Canon raw, ~2000+
	'tga', // TARGA, Truevision Advanced Raster Graphics Adapter
	'dng', // Digital Negative raw image file abstraction
	'gif', // Used for short animations and graphics on the web (Common)
	'heic', // Used primarily on Apple devices for images (Occasional)
	'heif', // Similar to HEIC, used for high-efficiency image files (Occasional)
	'jpeg', // Widely used for photos on the web and in digital cameras (Very common)
	'nef', // Nikon raw
	'pef', // Pentax raw
	'png', // Widely used for web graphics with transparency (Very common)
	'psd', // Photoshop
	'svg+xml', // Used for vector graphics in web applications (Common)
	'tiff', // Used in professional photography and scanning (Occasional)
	'webp', // Known for efficient compression and used increasingly on the web (Common)
	// 'apng', // An animated version of PNG used on some platforms (Occasional)
	// 'avci', // Associated with advanced video codecs (Rare)
	// 'avcs', // Associated with advanced video codecs (Rare)
	// 'cgm', // A format for technical applications like diagrams and technical drawings (Rare)
	// 'dicom-rle', // Used in medical imaging (Rare)
	// 'dpx', // Used in film production and digital intermediate processes (Rare)
	// 'emf', // Windows Enhanced Metafile, used less commonly today (Rare)
	// 'exr', // Used in professional film and video post-production (Rare)
	// 'fits', // Used mainly in astronomy (Rare)
	// 'g3fax', // Used in faxing (Rare)
	// 'heic-sequence', // Used for sequences of HEIC images (Rare)
	// 'heif-sequence', // Used for sequences of HEIF images (Rare)
	// 'hej2k', // A variant of JPEG 2000 (Rare)
	// 'hsj2', // Another variant of JPEG 2000 (Rare)
	// 'ief', // Image exchange format (Rare)
	// 'jls', // JPEG-LS, used for lossless compression (Rare)
	// 'jp2', // Used in digital cinema and broadcasting (Occasional)
	// 'jph', // Part of JPEG systems (Rare)
	// 'jphc', // Part of JPEG systems (Rare)
	// 'jpm', // JPEG Multiview Profile (Rare)
	// 'jpx', // An extended JPEG 2000 format (Rare)
	// 'jxr', // Developed by Microsoft, used in some specific applications (Rare)
	// 'jxra', // Part of JPEG XR extensions (Rare)
	// 'jxrs', // Part of JPEG XR extensions (Rare)
	// 'jxs', // JPEG XS for streaming applications (Rare)
	// 'jxsc', // Another JPEG XS variant (Rare)
	// 'jxsi', // Another JPEG XS variant (Rare)
	// 'jxss', // Another JPEG XS variant (Rare)
	// 'ktx', // Used for OpenGL applications (Rare)
	// 'ktx2', // An updated version of KTX (Rare)
	// 'prs.btif', // A less commonly used format (Rare)
	// 'prs.pti', // A less common proprietary format (Rare)
	// 'psb', // Photoshop
	// 'raw', // Raw image data
	// 'sgi', // Originally used in SGI workstations (Rare)
	// 't38', // Used in fax over IP (Rare)
	// 'tiff-fx', // A variant of TIFF for fax documents (Rare)
	// 'wmf', // Windows Metafile, used less commonly today (Rare)
] as const

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number]

// Function overloads, don't return undefined if validation is enabled
export function lookupImageMimeType(
	imagePath: string,
	validate?: undefined,
): ImageMimeType | undefined
export function lookupImageMimeType(imagePath: string, validate: false): ImageMimeType | undefined
export function lookupImageMimeType(imagePath: string, validate: true): ImageMimeType
export function lookupImageMimeType<U extends ImageMimeType[]>(
	imagePath: string,
	validate: U,
): U[number]

/**
 * Look up the MIME type of an image
 *
 * Note overloads
 */
export function lookupImageMimeType<U extends ImageMimeType[]>(
	imagePath: string,
	validate: boolean | U = false,
): ImageMimeType | undefined {
	const mime = lookup(imagePath)
	const shouldValidate = Array.isArray(validate) || validate

	if (mime === undefined) {
		if (shouldValidate) {
			// Check if we need to throw an error
			throw new Error(`No known image MIME type for ${imagePath}`)
		}

		return undefined
	}

	// Found a MIME, but is it in within the type definition?
	const validMimeTypes = Array.isArray(validate) ? validate : IMAGE_MIME_TYPES
	const matchedMimeTypes = validMimeTypes.find((type) => `image/${type}` === mime)

	if (shouldValidate && matchedMimeTypes === undefined) {
		throw new Error(`Invalid image MIME type: ${mime} for ${imagePath}`)
	}

	return matchedMimeTypes
}
