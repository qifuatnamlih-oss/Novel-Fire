import os
import re

def natural_sort_key(s):
    """Fungsi untuk mengurutkan file secara alami (1, 2, 10, bukan 1, 10, 2)."""
    return [int(text) if text.isdigit() else text.lower()
            for text in re.split('([0-9]+)', s)]

def merge_chapters(input_folder, output_file):
    # Memeriksa apakah folder ada
    if not os.path.exists(input_folder):
        print(f"Error: Folder '{input_folder}' tidak ditemukan.")
        return

    # Mengambil semua file .txt di dalam folder
    files = [f for f in os.listdir(input_folder) if f.endswith('.txt')]
    
    # Mengurutkan file agar bab tidak berantakan
    files.sort(key=natural_sort_key)
    
    if not files:
        print("Tidak ada file .txt yang ditemukan di folder tersebut.")
        return

    with open(output_file, 'w', encoding='utf-8') as outfile:
        for filename in files:
            file_path = os.path.join(input_folder, filename)
            
            # Mengambil nama file sebagai judul (tanpa .txt)
            title = os.path.splitext(filename)[0]
            
            print(f"Menggabungkan: {filename}")
            
            with open(file_path, 'r', encoding='utf-8') as infile:
                content = infile.read().strip()
                
                # Tambahkan catatan kustom di awal bab
                custom_note_text = f"Catatan Penerjemah: Bab ini diterjemahkan oleh NovelFire Team. Selamat membaca!\n\n"
                
                # Menulis dengan format yang dikenali sistem Bulk Upload (### Judul)
                outfile.write(f"### {title}\n")
                outfile.write(custom_note_text) # Sisipkan catatan kustom di sini
                outfile.write(content)
                outfile.write("\n\n") # Spasi antar bab

    print(f"\nSelesai! File gabungan disimpan di: {output_file}")

# KONFIGURASI: Ganti nama folder sesuai lokasi file bab kamu
FOLDER_INPUT = 'folder_bab_novel'
FILE_OUTPUT = 'siap_upload.txt'

if __name__ == "__main__":
    merge_chapters(FOLDER_INPUT, FILE_OUTPUT)