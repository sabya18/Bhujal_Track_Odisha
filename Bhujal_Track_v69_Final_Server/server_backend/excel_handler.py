import openpyxl
import json
import os
import sys
import argparse
import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FILE_PATH = os.path.join(SCRIPT_DIR, "CTC Pre-monsoon Field Book 2026.xlsx")

def dms_to_dd(dms_str):
    if dms_str is None:
        return None
    dms_str = str(dms_str).strip()
    if not dms_str:
        return None
    
    # Check if there are delimiters like underscore, dash, space, colon
    if any(delim in dms_str for delim in ['_', '-', ' ', '°', '\'', '"', ':']):
        # Replace all delimiters with space
        cleaned = dms_str.replace('_', ' ').replace('-', ' ').replace('°', ' ').replace('\'', ' ').replace('"', ' ').replace(':', ' ')
        parts = [p.strip() for p in cleaned.split() if p.strip()]
        if len(parts) >= 1:
            try:
                d = float(parts[0])
                m = float(parts[1]) if len(parts) > 1 else 0.0
                s = float(parts[2]) if len(parts) > 2 else 0.0
                
                direction = 1
                for p in parts:
                    if p.upper() in ['S', 'W']:
                        direction = -1
                
                dd = d + m / 60.0 + s / 3600.0
                return round(dd * direction, 6)
            except Exception:
                pass
                
    # Fallback to direct float
    try:
        return float(dms_str)
    except ValueError:
        pass
        
    return None

def format_date(val):
    if val is None:
        return None
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime('%d.%m.%Y')
    val_str = str(val).strip()
    if not val_str or val_str.lower() == 'nan' or val_str.lower() == 'none':
        return None
    if ' ' in val_str:
        val_str = val_str.split(' ')[0]
    if '-' in val_str:
        parts = val_str.split('-')
        if len(parts) == 3:
            if len(parts[0]) == 4:
                return f"{parts[2]}.{parts[1]}.{parts[0]}"
            return f"{parts[0]}.{parts[1]}.{parts[2]}"
    return val_str

def get_column_mapping(ws):
    # Determine header row and column mapping
    header_row = None
    for r in range(1, 15):
        vals = [ws.cell(row=r, column=c).value for c in range(1, ws.max_column + 1)]
        vals_str = [str(v).lower() for v in vals if v is not None]
        has_well = any("well number" in v or "well no" in v or "well id" in v or "well_id" in v for v in vals_str)
        has_loc = any("location of" in v or "location" in v for v in vals_str)
        if has_well and has_loc:
            header_row = r
            break
            
    if not header_row:
        # Fallback search
        for r in range(1, 10):
            vals = [ws.cell(row=r, column=c).value for c in range(1, ws.max_column + 1)]
            vals_str = [str(v).lower() for v in vals if v is not None]
            if any("location" in v for v in vals_str) and any("block" in v or "sl" in v for v in vals_str):
                header_row = r
                break
                
    if not header_row:
        return None, {}
        
    headers = [str(ws.cell(row=header_row, column=c).value).strip() if ws.cell(row=header_row, column=c).value is not None else "" for c in range(1, ws.max_column + 1)]
    
    col_map = {}
    for idx, h in enumerate(headers):
        h_lower = h.lower()
        if "sl" in h_lower and "no" in h_lower:
            col_map["sl_no"] = idx
        elif "block" in h_lower or "urban area" in h_lower or "urban_area" in h_lower:
            col_map["block"] = idx
        elif "location" in h_lower:
            col_map["location"] = idx
        elif "well type" in h_lower:
            col_map["well_type"] = idx
        elif "well number" in h_lower or "well no" in h_lower or "well id" in h_lower or "well_id" in h_lower:
            col_map["well_number"] = idx
        elif "lat" in h_lower and "date" not in h_lower:
            col_map["lat"] = idx
        elif ("long" in h_lower or "lon" in h_lower) and "date" not in h_lower:
            col_map["lon"] = idx
        elif "dt_site" in h_lower or "dt_sitevisit" in h_lower or "date of site" in h_lower or "dt_sitevist" in h_lower:
            col_map["date"] = idx
        elif "total depth" in h_lower or "tot_ depth" in h_lower or "total_depth" in h_lower or "depth" in h_lower:
            if "parapet" not in h_lower:
                col_map["depth"] = idx
        elif "parapet" in h_lower:
            col_map["parapet"] = idx
        elif "dtgwl" in h_lower and "bmp" in h_lower:
            col_map["dtgwl_bmp"] = idx
        elif "dtgwl" in h_lower and "mbgl" in h_lower:
            col_map["dtgwl_mbgl"] = idx
        elif "remark" in h_lower:
            col_map["remarks"] = idx
            
    # Set default indices if not found
    if "sl_no" not in col_map: col_map["sl_no"] = 0
    if "block" not in col_map: col_map["block"] = 1
    if "location" not in col_map: col_map["location"] = 2
    if "well_type" not in col_map: col_map["well_type"] = 3
    if "well_number" not in col_map: col_map["well_number"] = 4
    if "lat" not in col_map: col_map["lat"] = 5
    if "lon" not in col_map: col_map["lon"] = 6
    if "date" not in col_map: col_map["date"] = 7
    if "depth" not in col_map: col_map["depth"] = 8
    if "parapet" not in col_map: col_map["parapet"] = 9
    if "dtgwl_bmp" not in col_map: col_map["dtgwl_bmp"] = 10
    if "remarks" not in col_map: col_map["remarks"] = 13
    
    # Custom check for MBGL
    mbgl_col = None
    for idx, h in enumerate(headers):
        if "mbgl" in h.lower():
            mbgl_col = idx
    if mbgl_col is not None:
        col_map["dtgwl_mbgl"] = mbgl_col
        
    return header_row, col_map

def read_wells():
    wb = openpyxl.load_workbook(FILE_PATH, data_only=True)
    all_wells = []
    
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        header_row, col_map = get_column_mapping(ws)
        if not header_row:
            continue
            
        for r in range(header_row + 1, ws.max_row + 1):
            c1 = ws.cell(row=r, column=1).value
            c2 = ws.cell(row=r, column=2).value
            if c1 == 1 and c2 == 2:
                continue
                
            row_vals = [ws.cell(row=r, column=c).value for c in range(1, ws.max_column + 1)]
            if all(v is None for v in row_vals):
                continue
                
            def val(key):
                col_idx = col_map.get(key)
                if col_idx is not None and col_idx < len(row_vals):
                    return row_vals[col_idx]
                return None

            w_num = val("well_number")
            if not w_num:
                continue
            w_num_str = str(w_num).strip()
            import re
            if not re.search(r'[A-Za-z]', w_num_str):
                continue
                
            lat_raw = val("lat")
            lon_raw = val("lon")
            lat_dd = dms_to_dd(lat_raw)
            lon_dd = dms_to_dd(lon_raw)
            
            p_height = val("parapet")
            try:
                p_height = float(p_height) if p_height is not None else 0.0
            except ValueError:
                p_height = 0.0
                
            bmp_val = val("dtgwl_bmp")
            try:
                bmp_val = float(bmp_val) if bmp_val is not None else None
                if bmp_val is not None and (bmp_val > 150.0 or bmp_val < 0.0):
                    bmp_val = None
            except ValueError:
                bmp_val = None
                
            mbgl_val = val("dtgwl_mbgl") if "dtgwl_mbgl" in col_map else None
            try:
                mbgl_val = float(mbgl_val) if mbgl_val is not None else None
                if mbgl_val is not None and (mbgl_val > 150.0 or mbgl_val < 0.0):
                    mbgl_val = None
            except ValueError:
                mbgl_val = None
                
            if mbgl_val is None and bmp_val is not None:
                mbgl_val = round(bmp_val - p_height, 2)
                
            rem = val("remarks")
            rem_str = str(rem).strip() if rem is not None else ""
            
            well_data = {
                "sheet": sheet_name,
                "row_idx": r,
                "sl_no": str(val("sl_no")).strip() if val("sl_no") is not None else "",
                "block": str(val("block")).strip() if val("block") is not None else "",
                "location": str(val("location")).strip() if val("location") is not None else "",
                "well_type": str(val("well_type")).strip() if val("well_type") is not None else "",
                "well_number": str(w_num).strip(),
                "lat_raw": str(lat_raw).strip() if lat_raw is not None else "",
                "lon_raw": str(lon_raw).strip() if lon_raw is not None else "",
                "lat": lat_dd,
                "lon": lon_dd,
                "date": format_date(val("date")),
                "depth": str(val("depth")).strip() if val("depth") is not None else "",
                "parapet_height": p_height,
                "dtgwl_bmp": bmp_val,
                "dtgwl_mbgl": mbgl_val,
                "remarks": rem_str
            }
            all_wells.append(well_data)
            
    print(json.dumps(all_wells))

def write_well(sheet_name, row_idx, date_val, bmp_val, mbgl_val, parapet_val=None, lat_val=None, lon_val=None):
    wb = openpyxl.load_workbook(FILE_PATH)
    if sheet_name not in wb.sheetnames:
        print(json.dumps({"success": False, "error": f"Sheet {sheet_name} not found"}))
        return
        
    ws = wb[sheet_name]
    header_row, col_map = get_column_mapping(ws)
    if not header_row:
        print(json.dumps({"success": False, "error": f"Header not found in sheet {sheet_name}"}))
        return
        
    # Write date
    if "date" in col_map:
        date_col = col_map["date"] + 1  # 1-based for openpyxl
        ws.cell(row=row_idx, column=date_col).value = date_val if date_val else None
        
    # Write bmp
    if "dtgwl_bmp" in col_map:
        bmp_col = col_map["dtgwl_bmp"] + 1
        try:
            ws.cell(row=row_idx, column=bmp_col).value = float(bmp_val) if bmp_val is not None else None
        except ValueError:
            ws.cell(row=row_idx, column=bmp_col).value = None
            
    # Write mbgl (only if the column exists in this sheet)
    if "dtgwl_mbgl" in col_map:
        mbgl_col = col_map["dtgwl_mbgl"] + 1
        try:
            ws.cell(row=row_idx, column=mbgl_col).value = float(mbgl_val) if mbgl_val is not None else None
        except ValueError:
            ws.cell(row=row_idx, column=mbgl_col).value = None

    # Write parapet
    if "parapet" in col_map and parapet_val is not None:
        parapet_col = col_map["parapet"] + 1
        try:
            ws.cell(row=row_idx, column=parapet_col).value = float(parapet_val)
        except ValueError:
            pass

    # Write lat
    if "lat" in col_map and lat_val is not None:
        lat_col = col_map["lat"] + 1
        try:
            ws.cell(row=row_idx, column=lat_col).value = float(lat_val)
        except ValueError:
            pass

    # Write lon
    if "lon" in col_map and lon_val is not None:
        lon_col = col_map["lon"] + 1
        try:
            ws.cell(row=row_idx, column=lon_col).value = float(lon_val)
        except ValueError:
            pass
            
    wb.save(FILE_PATH)
    print(json.dumps({"success": True}))

def export_district(district_name, output_path):
    try:
        wb = openpyxl.load_workbook(FILE_PATH)
        sheets_to_keep = []
        d_lower = district_name.lower().strip()
        
        if 'kendrapara' in d_lower:
            sheets_to_keep = ['Kendrapara_Blocks', 'Kendrapara_urban']
        elif 'cuttack' in d_lower:
            sheets_to_keep = ['Cuttack_Blocks', 'Cuttack_Urban']
        elif 'jajpur' in d_lower:
            sheets_to_keep = ['Jajpur_Blocks', 'Jajpur_Urban']
        elif any(sub in d_lower for sub in ['jagsinghpur', 'jspur', 'jagatsinghpur']):
            sheets_to_keep = ['Jspur_Blocks']
        else:
            print(json.dumps({"success": False, "error": f"Unknown district: {district_name}"}))
            return

        # Delete sheets that are not to be kept
        for s_name in list(wb.sheetnames):
            if s_name not in sheets_to_keep:
                wb.remove(wb[s_name])
                
        wb.save(output_path)
        print(json.dumps({"success": True}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Excel data handler for groundwater measurements")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Read parser
    subparsers.add_parser("read", help="Read all wells from Excel")
    
    # Write parser
    write_parser = subparsers.add_parser("write", help="Write well visit data to Excel")
    write_parser.add_argument("--sheet", required=True, help="Sheet name")
    write_parser.add_argument("--row", required=True, type=int, help="Row index (1-based)")
    write_parser.add_argument("--date", help="Date string (dd.mm.yyyy)")
    write_parser.add_argument("--bmp", help="DTGWL BMP value")
    write_parser.add_argument("--mbgl", help="DTGWL MBGL value")
    write_parser.add_argument("--parapet", help="Parapet height value")
    write_parser.add_argument("--lat", help="Latitude value")
    write_parser.add_argument("--lon", help="Longitude value")
    
    # Export District parser
    export_parser = subparsers.add_parser("export_district", help="Export district-specific sheet")
    export_parser.add_argument("--district", required=True, help="District name")
    export_parser.add_argument("--output", required=True, help="Output path")
    
    args = parser.parse_args()
    
    if args.command == "read":
        read_wells()
    elif args.command == "write":
        bmp_f = None
        if args.bmp is not None and args.bmp.strip() != "" and args.bmp.strip().lower() != "null":
            bmp_f = float(args.bmp)
            
        mbgl_f = None
        if args.mbgl is not None and args.mbgl.strip() != "" and args.mbgl.strip().lower() != "null":
            mbgl_f = float(args.mbgl)
            
        parapet_f = None
        if args.parapet is not None and args.parapet.strip() != "" and args.parapet.strip().lower() != "null":
            parapet_f = float(args.parapet)

        lat_f = None
        if args.lat is not None and args.lat.strip() != "" and args.lat.strip().lower() != "null":
            try:
                lat_f = float(args.lat)
            except ValueError:
                pass

        lon_f = None
        if args.lon is not None and args.lon.strip() != "" and args.lon.strip().lower() != "null":
            try:
                lon_f = float(args.lon)
            except ValueError:
                pass
            
        write_well(args.sheet, args.row, args.date, bmp_f, mbgl_f, parapet_f, lat_f, lon_f)
    elif args.command == "export_district":
        export_district(args.district, args.output)
    else:
        parser.print_help()
