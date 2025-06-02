-- Exports images from Photos via automated GUI manipulation
-- It's an unsavory approach, but no other means of automation seems to yield higher quality edited image exports (so far)
-- Arguments are passed in their order of appearance in the GUI, and expect values exactly matching the UI strings in Photos.app
-- Accepts an individual photo UUID, or an album UUID (use osxphotos query to look up UUIDs)
on run { uuid, exportDirectory, photoKind, jpegQuality, tiffBitDepth, colorProfile, photoSize, maxSizeType, maxSizeValue, includeMetadata, includeLocation , fileName, sequentialPrefix, subfolderFormat}
		
	tell application "System Events"
		set wasRunning to (name of processes) contains "Photos"
	end tell
	
	tell application "Photos"
		activate
		
		-- Reset selection and view		
		tell application "System Events"
			tell process "Photos"
				repeat until exists menu bar 1
					delay 0.1
				end repeat
				click menu item "Library" of menu 1 of menu item "Photos" of menu 1 of menu bar item "View" of menu bar 1
				click menu item "Deselect All" of menu 1 of menu bar item "Edit" of menu bar 1
			end tell
		end tell
		
		-- Select photo or album for export by UUID
		try
			spotlight media item id (uuid)
		on error
			try
				spotlight album id (uuid)
			end try
		end try
		
		if (count of selection) is 0 then
			log "No photos to export"
			if not wasRunning then
				tell application "Photos" to quit
			end if
			return
		end if
	end tell
	
	-- Create export destination directory if necessary
	-- try
	-- 	do shell script "mkdir -p " & quoted form of exportDirectory
	-- on error errMsg number errNum
	-- 	display alert "Error creating directory" message errMsg & " (Error " & errNum & ")"
	-- end try
	
	-- Store initial state for logging
	set initialFiles to filesInExportDirectory(exportDirectory)
	
	tell application "System Events"
		tell process "Photos"
			
			-- Export command
			repeat until exists menu bar 1
				delay 0.1
			end repeat
			click menu item 1 of menu "Export" of menu item "Export" of menu "File" of menu bar item "File" of menu bar 1
			
			repeat until exists sheet 1 of window 1
				delay 0.1
			end repeat
			
			-- Set export preferences
			tell sheet 1 of window 1
				tell group "Photos"
					
					-- Ensure the disclosure is open
					if not (exists pop up button "Color Profile:") then
						click UI element 3
						delay 0.5
					end if
					
					tell pop up button "Photo Kind:"
						if value is not photoKind then
							click
							click menu item photoKind of menu 1
							delay 0.5
						end if
					end tell
					
					if photoKind is "JPEG" then
						tell pop up button "JPEG Quality:"
							if value is not jpegQuality then
								click
								click menu item jpegQuality of menu 1
								delay 0.5
							end if
						end tell
					end if
					
					if photoKind is "TIFF" then
						tell checkbox "16 Bit"
							if (value as boolean) is not (tiffBitDepth is 16) then
								click
							end if
						end tell
					end if
					
					tell pop up button "Color Profile:"
						if value is not colorProfile then
							click
							click menu item colorProfile of menu 1
							delay 0.5
						end if
					end tell
					
					tell pop up button "Size:"
						if value is not photoSize then
							click
							click menu item photoSize of menu 1
							delay 0.5
						end if
					end tell
					
					if photoSize is "Custom" then
						tell group 1
							
							tell pop up button "Max"
								if value is not maxSizeType then
									click
									click menu item maxSizeType of menu 1
									delay 0.5
								end if
							end tell
							
							tell text field 1
								if value is not maxSizeValue then
									set value of attribute "AXFocused" to true
									set value of attribute "AXValue" to maxSizeValue as string
									perform action "AXConfirm"
								end if
							end tell
							
						end tell
					end if
					
				end tell
				
				tell group "Info"
					tell checkbox "Title, Keywords, and Caption"
						if (value as boolean) is not (includeMetadata as boolean) then
							click
						end if
					end tell
					tell checkbox "Location Information"
						if (value as boolean) is not (includeLocation as boolean) then
							click
						end if
					end tell
				end tell
				
				tell group "File Naming"
					tell pop up button "File Name:"
						if value is not fileName then
							click
							click menu item fileName of menu 1
							delay 0.5
						end if
					end tell
					if fileName is "Sequential" then
						-- why not "Sequential Prefix:"?
						tell text field 1
							if value is not sequentialPrefix then
								set value of attribute "AXFocused" to true
								set value of attribute "AXValue" to sequentialPrefix
								perform action "AXConfirm"
							end if
						end tell
					end if
					tell pop up button "Subfolder Format:"
						if value is not subfolderFormat then
							click
							click menu item subfolderFormat of menu 1
							delay 0.5
						end if
					end tell
				end tell
				
				delay 0.5
				click button "Export"
				
			end tell
			
			-- Set export location
			repeat until exists sheet 1 of window 1
				delay 0.1
			end repeat
			
			tell sheet 1 of window 1
				keystroke "g" using {command down, shift down}
				repeat until exists sheet 1
					delay 0.1
				end repeat
				tell sheet 1
					keystroke exportDirectory
					key code 76
				end tell
				
				-- Getting stuck here...
				delay 1
				click button "Export"
			end tell
			
			-- Wait for the export to finish, but allow a few second for the progress indicator to appear
			set startTime to (current date)
			repeat until (not (exists progress indicator 1 of group 2 of toolbar 1 of window 1)) and ((current date) - startTime) > 2
				delay 0.25
			end repeat
			
		end tell
	end tell
	
	-- Clean up
	if not wasRunning then
		tell application "Photos" to quit
	end if
	
	-- Log the exported files	
	set currentFiles to filesInExportDirectory(exportDirectory)
	repeat with aFile in currentFiles
		if (initialFiles does not contain aFile) then
			set end of initialFiles to aFile
			log aFile
		end if
	end repeat
	
end run

-- Handler to get list of files excluding hidden ones
on filesInExportDirectory(exportDirectory)
	return paragraphs of (do shell script "find " & quoted form of exportDirectory & " -type f \\! -name \".*\"")
end filesInExportDirectory
