# D&D Companion: design brief

Tài liệu gốc cho mọi quyết định sản phẩm. Mọi thứ trong app phải đi theo file này. Muốn đổi thì sửa file này trước.

## 1. App này để làm gì

Một app điện thoại quản lý **một nhân vật D&D đang chơi**. Ba việc dùng nhiều nhất, theo thứ tự:

1. **Roll xúc xắc**: mở app rồi hất ngón tay là roll được, không qua bước nào.
2. **Theo dõi trong trận**: HP, slot, resource, condition, concentration.
3. **Tra cứu**: feature, spell, item, rule của chính nhân vật đó, sau đó mới tới toàn bộ sách.

Nguyên tắc: **ít thao tác nhất, mượt nhất, không thiếu và không sai thông tin.** Màn nào cũng phải trả lời được câu hỏi "người chơi cần làm gì trong 2 giây tới?".

## 2. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Nền tảng | iOS + Android: Expo (React Native), TypeScript |
| Ruleset | D&D 5e **2024** là mặc định; có cơ chế nạp homebrew |
| Dữ liệu | 5etools data (toàn bộ sách) + homebrew (5etools JSON, và PDF/Docs được chuyển sang JSON) |
| Tự động hoá | App tự tính mọi số (mod, PB, AC, save, skill, slot, feature); số nào cũng override tay được |
| Xúc xắc | 3D, **kết quả RNG định trước**: random ra số trước, rồi mô phỏng vật lý và xoay mặt xúc xắc cho khớp số |
| Màn đầu tiên | Khay xúc xắc (nửa dưới) + thông số gọn của nhân vật (nửa trên) |
| Roll từ sheet | Overlay khay trong suốt, roll khoảng 1 giây, hiện tổng đã cộng mod; attack có nút roll damage ngay tại đó |
| Visual | Hiện đại thuần, kiểu iOS: trung tính, không trang trí fantasy; dark mode đầy đủ |
| Lưu trữ | Local-first (mở app không chờ mạng) + **Supabase** sync giữa các máy |
| Theo dõi | HP / Temp HP / Death saves · Spell slot, resource, rest · Condition, concentration, exhaustion |
| Không nằm trong v1 | Inventory chi tiết (trọng lượng, tiền, attunement), multiplayer realtime với DM |
| Roll nâng cao | Lịch sử roll · Preset/công thức (`2d8+1d6+4`) · Reroll từng viên · Skin xúc xắc + âm thanh |

## 3. Khay xúc xắc

```
┌───────────────────────────┐
│ Nhân vật · HP 34/41 · AC 16│  ← thông số gọn, chạm vào HP để chỉnh (chưa làm)
│ Slots ●●○ ●○              │
├───────────────────────────┤
│                           │
│        (khay 3D)          │  ← nhấn giữ = nhấc xúc xắc; hất = ném
│                           │
├───────────────────────────┤
│           27              │  ← tổng + từng viên, nằm ngoài khay để không đè xúc xắc
│  [ADV|Normal|DIS]  − +2 + │
│  d4 d6 d8 d10 d12 d20 d% │  ← chạm = thêm 1 viên vào tay
└───────────────────────────┘
```

- **Chạm icon xúc xắc**: thêm 1 viên vào tay. Chạm viên đang trong tay: bỏ viên đó ra.
- **Nhấn giữ khay**: nhấc xúc xắc lên; xúc xắc lắc theo ngón tay, haptic nhẹ.
- **Hất lên**: ném. Tốc độ hất quyết định lực lăn. Va chạm có haptic và âm thanh.
- **Đường tắt**: mở app rồi hất ngay, khi tay đang trống, sẽ roll lại bộ xúc xắc gần nhất (mặc định 1d20).
- **ADV/DIS**: bật chip, hoặc vuốt 2 ngón (lên là ADV, xuống là DIS).
- **Kết quả**: tổng to ở giữa, từng viên ghi số nhỏ. Chạm một viên để reroll riêng viên đó (GWF, Lucky…).
- **Lịch sử**: vuốt từ cạnh trái vào. Mỗi dòng ghi công thức, từng viên, tổng, thời điểm.
- **Preset**: hàng chip lưu sẵn (`Fireball 8d6`, `Sneak Attack 3d6`); nhấn giữ để sửa; có ô gõ công thức.

### Cách xúc xắc ra đúng số định trước

1. `crypto.getRandomValues` sinh kết quả cho từng viên.
2. Chạy mô phỏng vật lý headless (không vẽ) với lực ném thật, ghi lại toàn bộ quỹ đạo cho tới khi xúc xắc dừng.
3. Đọc mặt đang ngửa; tính phép xoay ở hệ toạ độ local để mặt mang số đã sinh nằm đúng vị trí đó.
4. Phát lại quỹ đạo với phép xoay đó áp vào mesh. Nhìn vẫn là lăn vật lý thật, kết quả luôn đúng phân phối đều.

## 4. Điều hướng

| Cử chỉ | Hành động |
|---|---|
| Vuốt lên từ thanh thông số | Mở character sheet đầy đủ (bottom sheet) |
| Segmented trên sheet | Chuyển tab: Actions · Core · Spells · Features (Actions mặc định vì dùng nhiều nhất trong combat) |
| Chạm HP | Bàn phím số: `-7` là damage, `+5` là heal, `t8` là temp HP |
| Chạm skill / save / attack | Roll ngay trên overlay |
| Nhấn giữ một thứ bất kỳ | Xem chi tiết rule/feature/spell |
| Thanh tìm kiếm (kéo xuống) | Tra cứu toàn bộ dữ liệu |

## 5. Công nghệ

- **Expo SDK 58**, Expo Router, development build (không dùng Expo Go vì có native 3D).
- **3D**: `three` + `@react-three/fiber` (expo-gl trên native, WebGL trên web; chạy được trên web nên dễ kiểm tra tự động).
- **Vật lý**: `cannon-es`, chạy headless trước khi render rồi phát lại (xem mục 3).
- **Cử chỉ và animation**: `react-native-gesture-handler`, `react-native-reanimated`.
- **Bottom sheet**: `@gorhom/bottom-sheet` (khi làm sheet).
- **Haptics / âm thanh**: `expo-haptics`, `expo-audio`.
- **State**: `zustand`, lưu bằng AsyncStorage (`src/character/store.ts`), nên app đọc và ghi offline ngay lập tức. Supabase sync sẽ nằm phía sau store này (cần URL và key của project Supabase).
- **Dữ liệu tra cứu**: 5etools JSON (`npm run data:fetch` rồi `npm run data:build`) được tiền xử lý thành `src/data/compendium/` gồm index tìm kiếm và một file cho mỗi loại; app chỉ tải khi mở tra cứu, nên không làm chậm khởi động. Homebrew sẽ nạp chồng lên.
  - Quy tắc nội dung: mục nào có bản in mới hơn (`reprintedAs`) thì bỏ bản cũ; loại UA, reskin WoW, screen, sách nấu ăn và đan len.
  - Trong text, xúc xắc (`8d6`, `+5`) bấm vào là roll ngay; link mở mục tương ứng.
- **Rules engine** (`src/character/engine.ts`): thuần TypeScript, có unit test. Mọi số được tính ra kèm "nguồn" (ví dụ AC 16 = 10 + DEX 2 + Shield 2 + …); nhấn giữ một con số trên sheet để xem. Số nào cũng override tay được.
  - Đã có: ability, save, skill (proficient/expertise, Jack of All Trades), AC (giáp, Unarmored Defense của Barbarian/Monk/Draconic), speed, HP, hit dice, spell DC/attack, slot (đơn class, multiclass, third caster, pact), resource có giới hạn số lần dùng cùng cách hồi khi nghỉ, damage/heal/temp HP, concentration DC, death save, short/long rest, exhaustion (−2 cho mọi d20 test).
  - Attack (`src/character/combat.ts`): vũ khí 2024 với to-hit/damage, finesse, versatile, mastery (nếu class có Weapon Mastery), proficiency theo class, Martial Arts của Monk, Unarmed Strike; ghi chú Rage damage.
  - Spell: danh sách theo class (Wizard có spellbook + prepared), giới hạn cantrip/prepared, cast trừ slot hoặc pact slot, ritual, tự bật concentration; damage cantrip theo level nhân vật, upcast theo slot, healing cộng modifier.
  - Chưa có: feat và hiệu ứng magic item tự động (hiện nhập tay qua mục Bonuses), spell luôn-prepared của subclass, Rage/Sneak Attack tự cộng vào damage.

## 6. Hành vi đã chốt khi làm

- ADV/DIS dùng chung giữa khay và sheet, và **tự về Normal sau mỗi roll**: trong game advantage tính theo từng roll, nên để nút dính sẽ làm sai các roll sau mà người chơi không để ý.
- Khi tạo nhân vật, standard array và +2/+1 của background tự xếp theo ability chính của class; người chơi vẫn đổi được.
- Nat 20 trên attack: nút roll damage tự gấp đôi số xúc xắc (luật 2024).

## 7. Còn chờ

- File homebrew của người dùng (PDF/Docs + 5etools JSON).
- Danh sách house rules cụ thể.
