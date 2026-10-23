export type MenuMeal = {
  code: string;
  name: string;
  category: string;
  displayPrice: string | null;
  conditional: boolean;
};
const rolePatterns = [
  /汉堡|巨无霸|麦香鱼|板烧|牛堡|鸡腿堡|麦香鸡/,
  /薯条|麦乐鸡|薯饼|玉米|鸡翅/,
  /可乐|咖啡|美式|拿铁|奶铁|红茶|雪碧|牛奶|果汁|巧克力/,
  /冰淇淋|麦旋风|新地|苹果派|香芋派|奶昔/,
];
export function mealsForTrack(menu: MenuMeal[], track: number) {
  return menu.filter(
    (m) =>
      rolePatterns[track].test(m.name) &&
      !/套餐|随心配|双人|三人|全家|兑换券|会员卡/.test(m.name),
  );
}
export function matchTray(
  menu: MenuMeal[],
  foods: { name: string; code?: string }[],
) {
  return foods.map((food, i) => {
    const options = mealsForTrack(menu, i).filter((m) => !m.conditional);
    return (
      options.find((m) => m.code === food.code) ??
      options.find((m) => m.name === food.name) ??
      options.find(
        (m) => food.name.includes(m.name) || m.name.includes(food.name),
      ) ??
      options[0] ??
      null
    );
  });
}
