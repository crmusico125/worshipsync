import BackgroundPickerPanel from "./BackgroundPickerPanel";

interface Props {
  songId: number;
  songTitle: string;
  currentBackground: string | null;
  onChanged: (newPath: string | null) => void;
}

export default function BackgroundPicker({
  songId,
  songTitle,
  currentBackground,
  onChanged,
}: Props) {
  const handleSelect = async (background: string | null) => {
    await window.worshipsync.backgrounds.setBackground(songId, background);
    onChanged(background);
  };

  return (
    <BackgroundPickerPanel
      currentBackground={currentBackground}
      previewLabel={songTitle}
      onSelect={handleSelect}
    />
  );
}
