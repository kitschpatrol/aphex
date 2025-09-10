# /// script
# requires-python = "~=3.13"
# dependencies = [
#   "osxphotos==0.72.3",
# ]
# ///

# See:
# https://github.com/RhetTbull/osxphotos/blob/main/API_README.md
# https://rhettbull.github.io/osxphotos/index.html

from osxphotos.cli.export import export_cli
import osxphotos
import time

# osxphotos export ~/Desktop --only-photos --jpeg-ext jpeg --no-exportdb --no-progress --filename {uuid} --report ~/Desktop/report.json --skip-original-if-edited --edited-suffix "" --uuid "77758382-025A-446E-91C6-88A0BCAFDA91"

if __name__ == "__main__":
    print("Loading Photos Database")

    start_time = time.time()

    photosDatabase = osxphotos.PhotosDB()
    export_count = 0
    for photo in photosDatabase.photos():
        print(photo.original_filename, photo.date, photo.title, photo.keywords)
        print(photo.uuid)
        results = export_cli(
            dest="/Users/mika/Desktop",
            only_photos=True,
            skip_original_if_edited=True,
            no_progress=True,
            edited_suffix="",
            jpeg_ext="jpeg",
            no_exportdb=True,
            filename_template="{uuid}",
            uuid=[photo.uuid],
        )
        print("--------------------------------")
        print(results)
        export_count += 1
        if export_count >= 2:
            break

    end_time = time.time()
    print(f"Time taken: {end_time - start_time} seconds")
