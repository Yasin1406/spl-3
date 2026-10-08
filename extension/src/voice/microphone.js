document.getElementById("allow").addEventListener("click", async () => {
  const status = document.getElementById("status");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    status.textContent = "অনুমতি পাওয়া গেছে। আগের পৃষ্ঠায় ফিরে নেভিগেশনে কথা বলা শুরু করুন।";
  } catch { status.textContent = "মাইক্রোফোনের অনুমতি পাওয়া যায়নি। Chrome ও Windows-এর মাইক্রোফোন সেটিংস পরীক্ষা করুন।"; }
});
