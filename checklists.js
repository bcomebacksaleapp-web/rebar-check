// เช็กลิสต์ภาพถ่ายที่ต้องมีก่อนอนุมัติเทคอนกรีต แยกตามชนิดโครงสร้าง
// ⚠ ร่างตั้งต้น — วิศวกรโครงการต้องทวนกับแบบ/ข้อกำหนด/มาตรฐานที่ใช้ (เช่น วสท., มยผ.) ก่อนใช้จริง
// kind = ชนิดการวัดใน app.js (rebar | cover | wall | floor | null = ถ่ายภาพอย่างเดียว ไม่มีค่าวัด)
// shots: 'both' = 1× + ซูมตลับเมตร, 'wide' = 1× อย่างเดียว
export const ELEMENTS = {
  footing: { label: 'ฐานราก', items: [
    { id: 'id',     t: 'ป้ายตำแหน่ง/ชิ้นงาน + ภาพรวมหลุมฐานราก', kind: null, shots: 'wide' },
    { id: 'size',   t: 'ขนาดและความลึกฐานราก', kind: 'floor', shots: 'both' },
    { id: 'rebar',  t: 'เหล็กล่าง/บน ขนาดและระยะห่าง', kind: 'rebar', shots: 'both' },
    { id: 'cover',  t: 'ระยะหุ้มเหล็ก (ลูกปูน/ก้อนหนุน)', kind: 'cover', shots: 'both' },
    { id: 'dowel',  t: 'เหล็กเสียบเสา ตำแหน่งและความยาวทาบ', kind: null, shots: 'both' },
    { id: 'clean',  t: 'ก้นหลุมสะอาด ไม่มีน้ำขัง/ดินร่วง + คอนกรีตหยาบ', kind: null, shots: 'wide' },
  ]},
  column: { label: 'เสา', items: [
    { id: 'id',     t: 'ป้ายตำแหน่ง/ชิ้นงาน + ภาพรวมเสา', kind: null, shots: 'wide' },
    { id: 'main',   t: 'เหล็กแกน จำนวน/ขนาด', kind: null, shots: 'both' },
    { id: 'stirrup',t: 'เหล็กปลอก ระยะห่าง (ช่วงปลายถี่กว่า)', kind: 'rebar', shots: 'both' },
    { id: 'splice', t: 'ตำแหน่งและความยาวต่อทาบ', kind: null, shots: 'both' },
    { id: 'cover',  t: 'ระยะหุ้มเหล็ก', kind: 'cover', shots: 'both' },
    { id: 'section',t: 'ขนาดหน้าตัดแบบหล่อ + ความดิ่ง', kind: 'wall', shots: 'both' },
  ]},
  beam: { label: 'คาน', items: [
    { id: 'id',     t: 'ป้ายตำแหน่ง/ชิ้นงาน + ภาพรวมคาน', kind: null, shots: 'wide' },
    { id: 'rebar',  t: 'เหล็กบน/ล่าง จำนวนและขนาด', kind: null, shots: 'both' },
    { id: 'stirrup',t: 'เหล็กปลอก ระยะห่าง (ใกล้จุดรองรับถี่กว่า)', kind: 'rebar', shots: 'both' },
    { id: 'extra',  t: 'เหล็กเสริมพิเศษที่จุดรองรับ/ช่องเปิด', kind: null, shots: 'both' },
    { id: 'cover',  t: 'ระยะหุ้มเหล็ก', kind: 'cover', shots: 'both' },
    { id: 'clean',  t: 'ท้องแบบสะอาด ค้ำยันมั่นคง', kind: null, shots: 'wide' },
  ]},
  slab: { label: 'พื้น', items: [
    { id: 'id',     t: 'ป้ายตำแหน่ง/ชิ้นงาน + ภาพรวมพื้น', kind: null, shots: 'wide' },
    { id: 'rebar',  t: 'เหล็กล่าง/บน ขนาดและระยะห่าง', kind: 'rebar', shots: 'both' },
    { id: 'thick',  t: 'ความหนาพื้น (ไม้/เหล็กวัดระดับ)', kind: 'floor', shots: 'both' },
    { id: 'chairs', t: 'ขาตั้ง/ลูกปูนรองเหล็กบน-ล่าง ระยะหุ้ม', kind: 'cover', shots: 'both' },
    { id: 'opening',t: 'เหล็กเสริมรอบช่องเปิด/มุม', kind: null, shots: 'both' },
    { id: 'mep',    t: 'ท่อ/สายไฟฝัง ไม่ตัดหรือรบกวนเหล็ก', kind: null, shots: 'wide' },
    { id: 'clean',  t: 'ผิวแบบสะอาด ไม่มีเศษ/น้ำขัง', kind: null, shots: 'wide' },
  ]},
  wall: { label: 'ผนัง/กำแพง คสล.', items: [
    { id: 'id',     t: 'ป้ายตำแหน่ง/ชิ้นงาน + ภาพรวมผนัง', kind: null, shots: 'wide' },
    { id: 'rebar',  t: 'เหล็กตั้ง/นอน ขนาดและระยะห่าง', kind: 'rebar', shots: 'both' },
    { id: 'thick',  t: 'ความหนาผนัง (วัดระหว่างแบบ)', kind: 'wall', shots: 'both' },
    { id: 'tie',    t: 'เหล็กยึดแบบ/ตัวคั่น (spacer) และระยะหุ้ม', kind: 'cover', shots: 'both' },
    { id: 'clear',  t: 'เคลียร์ใน / เคลียร์นอก (เหล็กถึงผิวแบบทั้งสองด้าน)', kind: 'wallclear', shots: 'both' },
    { id: 'dowel',  t: 'เหล็กเสียบ/ต่อทาบกับพื้น-คาน', kind: null, shots: 'both' },
    { id: 'plumb',  t: 'ความดิ่งและการค้ำยันแบบ', kind: null, shots: 'wide' },
  ]},
  stair: { label: 'บันได', items: [
    { id: 'id',     t: 'ป้ายตำแหน่ง/ชิ้นงาน + ภาพรวมบันได', kind: null, shots: 'wide' },
    { id: 'main',   t: 'เหล็กหลักตามแนวเอียง + เหล็กกระจาย', kind: 'rebar', shots: 'both' },
    { id: 'thick',  t: 'ความหนาแผ่นบันได', kind: 'floor', shots: 'both' },
    { id: 'anchor', t: 'การยึดเหล็กกับคาน/พื้น/ผนัง', kind: null, shots: 'both' },
    { id: 'cover',  t: 'ระยะหุ้มเหล็ก', kind: 'cover', shots: 'both' },
  ]},
};
