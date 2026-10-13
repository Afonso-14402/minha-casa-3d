# Minha Casa 3D

Desenha a tua casa em 3D no navegador: levanta paredes, abre portas e janelas, escolhe o chão e as cores, mobila as divisões e depois passeia lá dentro à altura dos olhos.

## Abrir

- **No computador:** abre o `index.html` no Chrome, Edge ou Firefox.
- **Na internet:** em *Settings → Pages* do repositório, escolhe a branch `main` e a pasta `/ (root)`. A casa fica em `https://<utilizador>.github.io/minha-casa-3d/`.

Precisa de internet para carregar o motor 3D ([three.js](https://threejs.org/) r128) e as letras.

Os móveis, portas e janelas são modelos 3D feitos no Blender (pasta `modelos/`). O navegador só os carrega quando o site é servido por um servidor (GitHub Pages ou `python3 -m http.server`); se abrires o `index.html` diretamente, aparecem versões mais simples dos móveis.

## Ferramentas

| Tecla | Ferramenta | O que faz |
|---|---|---|
| 1 | Ver | Rodar, aproximar e deslocar a vista |
| 2 | Paredes | Arrastar na grelha (parede a parede ou divisão inteira) |
| 3 | Portas | Clicar numa parede para pôr ou tirar uma porta |
| 4 | Janelas | Janela normal ou envidraçado até ao chão |
| 5 | Chão | Madeiras, mosaico, mármore, deck, calçada, relva… |
| 6 | Pintar | Tintas e revestimentos (azulejo, tijolo, pedra, lambrim) |
| 7 | Móveis | Sala, cozinha, quarto, casa de banho, decoração, luzes e jardim |
| 8 | Mover | Arrastar, rodar (`R`), duplicar e apagar (`Delete`) |
| 9 | Apagar | Clicar ou arrastar por cima do que queres tirar |
| 0 | Passear | Visitar a casa por dentro, à altura dos olhos (ver abaixo) |

`Ctrl+Z` desfaz e `Ctrl+Y` refaz. A hora do dia no topo muda a luz do sol; à noite os candeeiros acendem.

## Casas prontas

Em **Casa → Casas prontas** escolhes uma casa para começar:

| Casa | O que tem |
|---|---|
| Estúdio | T0 com cozinha aberta, cama, casa de banho e varanda |
| Apartamento T1 | Quarto, sala com cozinha, casa de banho e varanda |
| Moradia T2 | Dois quartos, sala, cozinha, casa de banho e esplanada |
| Moradia T3 com piscina | Três quartos, escritório, cozinha com ilha, piscina e jardim |

Cada uma abre **mobilada** (pronta a mostrar) ou **só com as paredes** (portas, janelas, chão e cores, mas sem móveis) para a mobilares tu. `Ctrl+Z` volta à casa que tinhas antes.

## Móveis e acessórios

Mais de 60 peças feitas no Blender, com várias cores e madeiras:

- **Sala:** sofá, sofá de canto, poltrona, pufe, mesa de centro, móvel de TV, aparador, estante, lareira, tapete, candeeiro de pé
- **Cozinha:** bancada, lava-loiça, placa e forno, armário de parede, frigorífico, máquina da loiça, ilha, bancos altos, mesa de jantar, mesa redonda, cadeiras
- **Quarto:** cama de casal e de solteiro, beliche, berço, mesa de cabeceira, roupeiro, cómoda, toucador, secretária, cadeira de escritório
- **Casa de banho:** sanita, lavatório, banheira, duche, máquina da roupa, toalheiro, armário com espelho
- **Decoração:** quadro, espelho redondo, relógio de parede, cortinas, prateleira, vaso com flores, plantas e cato
- **Luzes:** candeeiro de teto e interruptor
- **Jardim:** árvore, arbusto, floreira, espreguiçadeira, mesa de jardim, guarda-sol, churrasqueira e piscina

O que se pendura na parede (quadros, espelhos, cortinas…) encosta-se sozinho à parede mais próxima.

## Visitar a casa

Na ferramenta **Passear** andas dentro da casa à altura dos olhos, como numa visita. Clica no ecrã para controlar a vista com o rato (`Esc` solta o rato; outro `Esc` sai).

| Tecla | O que faz |
|---|---|
| `W A S D` / setas | Andar |
| `E` ou clique | Abrir e fechar portas, acender e apagar candeeiros, carregar nos interruptores |
| `Shift` | Andar depressa |

No telemóvel há setas para andar e o botão **Usar**; arrasta no ecrã para olhar. As portas fechadas e os móveis não se atravessam. Os interruptores acendem e apagam os candeeiros da divisão; muda a hora do dia no topo para mostrar a casa de manhã, ao pôr do sol ou à noite.

## Guardar e partilhar

A casa fica guardada sozinha no navegador. Em **Casa → Código da casa** podes copiar o código para o guardar ou mandar a alguém, ou colar o código de outra casa para a abrir.

## Móveis feitos no Blender

O ficheiro `blender/moveis.py` desenha todos os modelos por código e gera, para cada um, `modelos/<nome>.glb` e uma foto em `modelos/fotos/<nome>.png` (a que aparece no catálogo).

```sh
pip install bpy                                  # Blender como módulo de Python (ou usa o Blender instalado)
python blender/moveis.py -- modelos              # todos
python blender/moveis.py -- modelos sofa,cama    # só alguns
```

Para juntar um móvel novo: cria uma função com `@modelo('nome', cor, tipo)` em `blender/moveis.py`, gera o modelo e acrescenta a entrada com o mesmo nome em `ITEMS` no `casa.js` (nome, categoria, medidas e cores). Os nomes dos materiais no Blender dizem ao site que material usar: `Cor` é a cor escolhida pelo utilizador; a lista completa está no início de `moveis.py`.

## Ficheiros

- `index.html` — a página
- `estilo.css` — o aspeto (tema claro e escuro, ecrãs pequenos)
- `casa.js` — o motor da casa: texturas, materiais, móveis, ferramentas e passeio
- `modelos/` — móveis, portas e janelas em 3D (`.glb`) e as fotos do catálogo
- `blender/moveis.py` — o programa do Blender que gera a pasta `modelos/`
