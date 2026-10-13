# Minha Casa 3D

Desenha a tua casa em 3D no navegador: levanta paredes, abre portas e janelas, escolhe o chão e as cores, mobila as divisões e depois passeia lá dentro à altura dos olhos.

## Abrir

- **No computador:** abre o `index.html` no Chrome, Edge ou Firefox.
- **Na internet:** em *Settings → Pages* do repositório, escolhe a branch `main` e a pasta `/ (root)`. A casa fica em `https://<utilizador>.github.io/minha-casa-3d/`.

Precisa de internet para carregar o motor 3D ([three.js](https://threejs.org/) r128) e as letras.

## Ferramentas

| Tecla | Ferramenta | O que faz |
|---|---|---|
| 1 | Ver | Rodar, aproximar e deslocar a vista |
| 2 | Paredes | Arrastar na grelha (parede a parede ou divisão inteira) |
| 3 | Portas | Clicar numa parede para pôr ou tirar uma porta |
| 4 | Janelas | Janela normal ou envidraçado até ao chão |
| 5 | Chão | Madeiras, mosaico, mármore, deck, calçada, relva… |
| 6 | Pintar | Tintas e revestimentos (azulejo, tijolo, pedra, lambrim) |
| 7 | Móveis | Sala, cozinha, quarto, casa de banho e decoração |
| 8 | Mover | Arrastar, rodar (`R`), duplicar e apagar (`Delete`) |
| 9 | Apagar | Clicar ou arrastar por cima do que queres tirar |
| 0 | Passear | `W A S D` / setas para andar, arrastar para olhar, `Shift` corre, `Esc` sai |

`Ctrl+Z` desfaz e `Ctrl+Y` refaz. A hora do dia no topo muda a luz do sol; à noite os candeeiros acendem.

## Guardar e partilhar

A casa fica guardada sozinha no navegador. Em **Casa → Código da casa** podes copiar o código para o guardar ou mandar a alguém, ou colar o código de outra casa para a abrir.

## Ficheiros

- `index.html` — a página
- `estilo.css` — o aspeto (tema claro e escuro, ecrãs pequenos)
- `casa.js` — o motor da casa: texturas, materiais, móveis, ferramentas e passeio
