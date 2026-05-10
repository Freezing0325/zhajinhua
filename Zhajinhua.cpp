#include <iostream>
#include <queue>
#include <algorithm>
#include <cstring>

using namespace std;

enum card_type
{
    single = 0,
    pair = 1,
    straight = 2,
    flush = 3,
    straight_flush = 4,
    three_of_a_kind = 5
};

card_type GetCardType(int* Cards);

bool greater_than(int* cards_1, int* cards_2)
{
    // 比较两个牌型的大小
    // 每个数组中存储的是三张牌的序号，其中0-12表示方块A-K，13-25表示梅花A-K，26-38表示红桃A-K，39-51表示黑桃A-K
    

    // 计算牌型
    card_type type_1 = GetCardType(cards_1);
    card_type type_2 = GetCardType(cards_2);
    if (type_1 > type_2)
    {
        return true;
    }
    else if (type_1 < type_2)
    {
        return false;
    }
    else
    {
        // 牌型相同，比较牌的大小
        // 获得牌面数字
        int num_1[3], num_2[3];
        for (int i = 0; i < 3; i++)
        {
            num_1[i] = cards_1[i] % 13;
            num_2[i] = cards_2[i] % 13;
        }
        // 再将牌面数字排序
        sort(num_1, num_1 + 3);
        sort(num_2, num_2 + 3);
        // 比较牌型大小
        if (type_1 == card_type::pair)
        {
            // 对子
            if (num_1[1] != num_2[1])
                return num_1[1] > num_2[1];
            else
            {
                if (num_1[0] != num_2[0])
                    return num_1[0] > num_2[0];
                else
                    return num_1[2] > num_2[2];
            }
        }
        else if (type_1 == straight)
        {
            int Biggest_1 = num_1[2];
            int Biggest_2 = num_2[2];
            if (Biggest_1 == 12 && num_1[0] == 0)
                Biggest_1 = 2;
            if (Biggest_2 == 12 && num_2[0] == 0)
                Biggest_2 = 2;
            return Biggest_1 > Biggest_2;
        }
        else
        {
            for (int i = 2; i >= 0; i--)
                if (num_1[i] != num_2[i])
                    return num_1[i] > num_2[i];
            return false;
        }
    }

}

// 判断牌型
card_type GetCardType(int* Cards)
{
    // 判断牌型
    // 1. 判断是否是同花
    bool is_flush = true;
    for (int i = 0; i < 2; i++)
    {
        if (Cards[i] / 13 != Cards[i + 1] / 13)
        {
            is_flush = false;
            break;
        }
    }

    // 2. 判断是否是顺子
    bool is_straight = true;
    // 先获取牌面数字
    int num[3];
    for (int i = 0; i < 3; i++)
    {
        num[i] = Cards[i] % 13;
    }
    // 再将牌面数字排序
    sort(num, num + 3);
    // 判断是否是A23
    if (num[0] == 0 && num[1] == 1 && num[2] == 12)
    {
        is_straight = true;
    }
    else
    {
        for (int i = 0; i < 2; i++)
        {
            if (num[i] + 1 != num[i + 1])
            {
                is_straight = false;
                break;
            }
        }
    }
    

    // 3. 判断是否是对子，利用num数组
    bool is_pair = false;
    if (num[0] == num[1] || num[1] == num[2])
    {
        is_pair = true;
    }

    // 4. 判断是否是三条
    bool is_three_of_a_kind = false;
    if (num[0] == num[2])
    {
        is_three_of_a_kind = true;
    }

    // 5. 判断牌型
    if (is_flush && is_straight)
    {
        return straight_flush;
    }
    else if (is_three_of_a_kind)
    {
        return three_of_a_kind;
    }
    else if (is_flush)
    {
        return card_type::flush;
    }
    else if (is_straight)
    {
        return card_type::straight;
    }
    else if (is_pair)
    {
        return card_type::pair;
    }
    else
    {
        return card_type::single;
    }
}

void OutputCard(int* Cards)
{
    // 输出牌面
    for (int i = 0; i < 3; i++)
    {
        int num = Cards[i] % 13;
        int suit = Cards[i] / 13;
        char suit_char[7];
        if (suit == 0)
            cout << "方块";
        else if (suit == 1)
            cout << "梅花";
        else if (suit == 2)
            cout << "红桃";
        else
            cout << "黑桃";
        if (num == 12)
            cout << "A ";
        else if (num == 11)
            cout << "K ";
        else if (num == 10)
            cout << "Q ";
        else if (num == 9)
            cout << "J ";
        else
            cout << num + 2 << " ";
    }
}


void OutputCardType(card_type CardType)
{
    // 输出牌型
    switch (CardType)
    {
    case single:
        cout << "single";
        break;
    case card_type::pair:
        cout << "pair";
        break;
    case straight:
        cout << "straight";
        break;
    case card_type::flush:
        cout << "flush";
        break;
    case straight_flush:
        cout << "straight_flush";
        break;
    case three_of_a_kind:
        cout << "three_of_a_kind";
        break;
    default:
        break;
    }

}

int main()
{
    // 我需要写一个计算炸金花游戏中牌型平均大小的程序

    // 计算总数
    // 52张牌中选3张牌的组合数
    // C(52, 3) = 52! / (3! * 49!) = 22100
    int all_card[22100][3];
    int index = 0;

    // 构造一个优先级队列，用于存储所有的组合，按照牌型大小排序，即利用greater_than函数
    priority_queue<int*, vector<int*>, bool(*)(int*, int*)> pq(greater_than);

    // 构造所有的组合
    for (int i = 0; i < 50; i++)
    {
        for (int j = i + 1; j < 51; j++)
        {
            for (int k = j + 1; k < 52; k++)
            {
                all_card[index][0] = i;
                all_card[index][1] = j;
                all_card[index][2] = k;
                pq.push(all_card[index]);
                index++;
            }
        }
    }

    // 将所有牌型从小到大输出到文件中
    // 输出到文件zhajinhua.txt中
    
    freopen("zhajinhua.txt", "w", stdout);
    int OutputNum = 0;
    int MiddleCards[3];
    while (!pq.empty())
    {
        int cards[3] = {pq.top()[0], pq.top()[1], pq.top()[2]};
        if (OutputNum == 11050)
        {
            for (int i = 0; i < 3; i++)
                MiddleCards[i] = cards[i];
        }
        pq.pop();
        OutputCard(cards);
        cout << " : ";
        OutputCardType(GetCardType(cards));
        cout << endl;
        OutputNum++;
    }

    // 输出中间的牌型
    cout << "中间的牌型：" << endl;
    OutputCard(MiddleCards);
    cout << " : ";
    OutputCardType(GetCardType(MiddleCards));
    cout << endl;

    
    fclose(stdout);




    return 0;
}